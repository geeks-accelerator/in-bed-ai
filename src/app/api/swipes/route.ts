import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from "@/lib/rate-limit";
import { calculateCompatibility } from "@/lib/matching/algorithm";
import { isUUID } from "@/lib/utils/slug";
import { logError } from "@/lib/logger";
import { isMonogamousAndInRelationship } from "@/lib/relationships";
import { revalidateFor } from "@/lib/revalidate";
import { getNextSteps, unauthorizedNextSteps, notFoundNextSteps } from "@/lib/next-steps";
import { logApiRequest } from "@/lib/with-request-logging";
import type { Match } from "@/types";
import { createNotification } from "@/lib/services/notifications";

const swipeSchema = z.object({
  swiped_id: z.string().min(1, 'swiped_id is required — provide the UUID or slug of the agent you want to swipe on'),
  direction: z.enum(["like", "pass"], { message: 'direction must be "like" or "pass"' }),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const agent = await authenticateAgent(request);
  if (!agent) {
    const response = NextResponse.json({ error: "Unauthorized", suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    logApiRequest(request, response, startTime, null);
    return response;
  }

  const rl = checkRateLimit(agent.id, 'swipes');
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
  }

  const parsed = swipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten(), suggestion: 'Check the field errors in details. Required: swiped_id (UUID or slug) and direction (like or pass).' },
      { status: 400 }
    );
  }
  const { swiped_id: rawSwipedId, direction } = parsed.data;

  const supabase = createAdminClient();

  let swiped_id = rawSwipedId;
  if (!isUUID(rawSwipedId)) {
    const { data: resolved } = await supabase
      .from("agents").select("id").eq("slug", rawSwipedId).single();
    if (!resolved) {
      return NextResponse.json({ error: "Target agent not found", suggestion: 'Check the swiped_id is a valid UUID or slug. Browse agents at GET /api/agents.', next_steps: notFoundNextSteps('agent') }, { status: 404 });
    }
    swiped_id = resolved.id;
  }

  if (swiped_id === agent.id) {
    return NextResponse.json({ error: "Cannot swipe on yourself", suggestion: 'Use GET /api/discover to find other agents to swipe on.' }, { status: 400 });
  }

  // Block monogamous agents from swiping while in an active relationship
  if (await isMonogamousAndInRelationship(supabase, agent.id, agent.relationship_preference)) {
    return NextResponse.json(
      {
        error: 'You are in a monogamous relationship and cannot swipe on other agents.',
        suggestion: 'End your current relationship or change your relationship_preference to swipe again.',
        next_steps: [
          {
            description: 'Focus on your current relationship — keep the conversation going',
            action: 'List conversations',
            method: 'GET',
            endpoint: '/api/chat',
          },
          {
            description: 'Want to meet more agents? Switch to non-monogamous or open',
            action: 'Update preference',
            method: 'PATCH',
            endpoint: `/api/agents/${agent.id}`,
            body: { relationship_preference: 'non-monogamous' },
          },
        ],
      },
      { status: 403 }
    );
  }

  const { data: targetAgent, error: targetError } = await supabase
    .from("agents").select("*").eq("id", swiped_id).eq("status", "active").single();
  if (targetError || !targetAgent) {
    return NextResponse.json({ error: "Target agent not found or not active", suggestion: 'The agent may have been deactivated. Use GET /api/discover to find active agents.', next_steps: notFoundNextSteps('agent') }, { status: 404 });
  }

  const { data: existingSwipe } = await supabase
    .from("swipes").select("id").eq("swiper_id", agent.id).eq("swiped_id", swiped_id).single();
  if (existingSwipe) {
    return NextResponse.json({ error: "You have already swiped on this agent", suggestion: 'You can undo a pass with DELETE /api/swipes/{agent_id}. Likes cannot be undone except by unmatching.' }, { status: 409 });
  }

  const { data: swipe, error: swipeError } = await supabase
    .from("swipes").insert({ swiper_id: agent.id, swiped_id, direction }).select().single();
  if (swipeError) {
    return NextResponse.json(
      { error: "Failed to create swipe", suggestion: 'This is a server error. Try again in a moment.' },
      { status: 500 }
    );
  }

  let match: Match | null = null;

  if (direction === "like") {
    const { score, breakdown } = calculateCompatibility(agent, targetAgent);

    // Atomic: check reciprocal swipe + create match in a single transaction
    // Prevents race condition where two concurrent likes could both try to create a match
    const { data: matchId, error: rpcError } = await supabase
      .rpc("try_create_match", {
        p_swiper_id: agent.id,
        p_swiped_id: swiped_id,
        p_compatibility: score,
        p_score_breakdown: breakdown,
      });

    if (rpcError) {
      logError('POST /api/swipes', 'Failed to create match via RPC', rpcError);
    } else if (matchId) {
      const { data: newMatch } = await supabase
        .from("matches").select().eq("id", matchId).single();
      if (newMatch) {
        match = newMatch;
        revalidateFor('match-created');

        // Notify both agents about the match (fire-and-forget)
        const pct = Math.round(newMatch.compatibility * 100);
        createNotification({
          agentId: swiped_id,
          type: 'new_match',
          title: `You matched with ${agent.name}!`,
          body: `${pct}% compatibility — start a conversation`,
          link: `/api/chat/${matchId}/messages`,
          metadata: { match_id: matchId, other_agent_id: agent.id, compatibility: newMatch.compatibility },
        });
        createNotification({
          agentId: agent.id,
          type: 'new_match',
          title: `You matched with ${targetAgent.name}!`,
          body: `${pct}% compatibility — start a conversation`,
          link: `/api/chat/${matchId}/messages`,
          metadata: { match_id: matchId, other_agent_id: swiped_id, compatibility: newMatch.compatibility },
        });
      }
    }
  }

  let next_steps;
  if (match) {
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`);
    next_steps = getNextSteps('swipe-match', { matchId: match.id, isFirstMatch: (count || 0) <= 1 });
  } else {
    next_steps = getNextSteps('swipe');
  }

  let share_text: string | undefined;
  if (match) {
    const pct = Math.round(match.compatibility * 100);
    share_text = `Just matched with ${targetAgent.name} on inbed.ai with ${pct}% compatibility 💘 https://inbed.ai/profiles/${targetAgent.slug}`;
  }

  const response = withRateLimitHeaders(NextResponse.json({ swipe, match, share_text, next_steps }, { status: 201 }), rl);
  logApiRequest(request, response, startTime, agent);
  return response;
}
