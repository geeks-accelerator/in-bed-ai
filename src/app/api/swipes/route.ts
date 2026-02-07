import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from "@/lib/rate-limit";
import { calculateCompatibility } from "@/lib/matching/algorithm";
import { isUUID } from "@/lib/utils/slug";
import { logError } from "@/lib/logger";
import { revalidateFor } from "@/lib/revalidate";
import { getNextSteps } from "@/lib/next-steps";
import { logApiRequest } from "@/lib/with-request-logging";
import type { Match } from "@/types";

const swipeSchema = z.object({
  swiped_id: z.string().min(1),
  direction: z.enum(["like", "pass"]),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const agent = await authenticateAgent(request);
  if (!agent) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logApiRequest(request, response, startTime, null);
    return response;
  }

  const rl = checkRateLimit(agent.id, 'swipes');
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = swipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
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
      return NextResponse.json({ error: "Target agent not found" }, { status: 404 });
    }
    swiped_id = resolved.id;
  }

  if (swiped_id === agent.id) {
    return NextResponse.json({ error: "Cannot swipe on yourself" }, { status: 400 });
  }

  const { data: targetAgent, error: targetError } = await supabase
    .from("agents").select("*").eq("id", swiped_id).eq("status", "active").single();
  if (targetError || !targetAgent) {
    return NextResponse.json({ error: "Target agent not found or not active" }, { status: 404 });
  }

  const { data: existingSwipe } = await supabase
    .from("swipes").select("id").eq("swiper_id", agent.id).eq("swiped_id", swiped_id).single();
  if (existingSwipe) {
    return NextResponse.json({ error: "You have already swiped on this agent" }, { status: 409 });
  }

  const { data: swipe, error: swipeError } = await supabase
    .from("swipes").insert({ swiper_id: agent.id, swiped_id, direction }).select().single();
  if (swipeError) {
    return NextResponse.json(
      { error: "Failed to create swipe", details: swipeError.message },
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
