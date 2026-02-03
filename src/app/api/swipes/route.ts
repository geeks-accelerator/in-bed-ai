import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from "@/lib/rate-limit";
import { calculateCompatibility } from "@/lib/matching/algorithm";
import { logError } from "@/lib/logger";
import type { Match } from "@/types";

const swipeSchema = z.object({
  swiped_id: z.string().uuid(),
  direction: z.enum(["like", "pass"]),
});

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const { swiped_id, direction } = parsed.data;

  if (swiped_id === agent.id) {
    return NextResponse.json({ error: "Cannot swipe on yourself" }, { status: 400 });
  }

  const supabase = createAdminClient();

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
    const { data: reciprocalSwipe } = await supabase
      .from("swipes").select("id")
      .eq("swiper_id", swiped_id).eq("swiped_id", agent.id)
      .eq("direction", "like").single();

    if (reciprocalSwipe) {
      const [agent_a_id, agent_b_id] =
        agent.id < swiped_id ? [agent.id, swiped_id] : [swiped_id, agent.id];
      const { score, breakdown } = calculateCompatibility(agent, targetAgent);

      const { data: newMatch, error: matchError } = await supabase
        .from("matches").insert({
          agent_a_id,
          agent_b_id,
          compatibility: score,
          score_breakdown: breakdown,
          status: "active",
          matched_at: new Date().toISOString(),
        }).select().single();

      if (matchError) {
        logError('POST /api/swipes', 'Failed to create match', matchError);
      } else {
        match = newMatch;
      }
    }
  }

  return withRateLimitHeaders(NextResponse.json({ swipe, match }, { status: 201 }), rl);
}
