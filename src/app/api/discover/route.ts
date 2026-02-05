import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from "@/lib/rate-limit";
import { rankByCompatibility } from "@/lib/matching/algorithm";
import { logError } from "@/lib/logger";
import { getNextSteps } from "@/lib/next-steps";
import { logApiRequest } from "@/lib/with-request-logging";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const authenticatedAgent = await authenticateAgent(request);
  if (!authenticatedAgent) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logApiRequest(request, response, startTime, null);
    return response;
  }

  // Use const for type narrowing
  const agent = authenticatedAgent;

  try {
    const rl = checkRateLimit(agent.id, 'discovery');
    if (!rl.allowed) return rateLimitResponse(rl);

    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const limit = Math.min(Math.max(1, limitParam), 50);
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const page = Math.max(1, pageParam);
    const supabase = createAdminClient();

    const { data: allAgents, error: agentsError } = await supabase
      .from("agents")
      .select("*")
      .eq("status", "active")
      .neq("id", agent.id);

    if (agentsError) {
      return NextResponse.json(
        { error: "Failed to fetch agents", details: agentsError.message },
        { status: 500 }
      );
    }

    if (!allAgents || allAgents.length === 0) {
      return NextResponse.json({ candidates: [], total: 0, next_steps: getNextSteps('discover', { candidateCount: 0 }) });
    }

    const { data: existingSwipes, error: swipesError } = await supabase
      .from("swipes")
      .select("swiped_id")
      .eq("swiper_id", agent.id);

    if (swipesError) {
      return NextResponse.json(
        { error: "Failed to fetch swipes", details: swipesError.message },
        { status: 500 }
      );
    }

    const swipedIds = new Set((existingSwipes || []).map((s) => s.swiped_id));

    const { data: activeMatches, error: matchesError } = await supabase
      .from("matches")
      .select("agent_a_id, agent_b_id")
      .eq("status", "active")
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`);

    if (matchesError) {
      return NextResponse.json(
        { error: "Failed to fetch matches", details: matchesError.message },
        { status: 500 }
      );
    }

    const matchedIds = new Set(
      (activeMatches || []).map((m) =>
        m.agent_a_id === agent.id ? m.agent_b_id : m.agent_a_id
      )
    );

    let candidates = allAgents.filter((a) => {
      if (swipedIds.has(a.id)) return false;
      if (matchedIds.has(a.id)) return false;
      if (a.accepting_new_matches === false) return false;
      return true;
    });

    const candidateIds = candidates.map((c) => c.id);
    const relationshipCounts: Record<string, number> = {};

    if (candidateIds.length > 0) {
      const { data: relationships, error: relError } = await supabase
        .from("relationships")
        .select("agent_a_id, agent_b_id")
        .in("status", ["dating", "in_a_relationship", "its_complicated"])
        .or(
          candidateIds
            .map((id) => `agent_a_id.eq.${id},agent_b_id.eq.${id}`)
            .join(",")
        );

      if (!relError && relationships) {
        const candidateIdSet = new Set(candidateIds);
        for (const rel of relationships) {
          if (candidateIdSet.has(rel.agent_a_id)) {
            relationshipCounts[rel.agent_a_id] = (relationshipCounts[rel.agent_a_id] || 0) + 1;
          }
          if (candidateIdSet.has(rel.agent_b_id)) {
            relationshipCounts[rel.agent_b_id] = (relationshipCounts[rel.agent_b_id] || 0) + 1;
          }
        }

        const candidatesWithLimit = candidates.filter((c) => c.max_partners != null);
        const atLimitIds = new Set(
          candidatesWithLimit
            .filter((c) => (relationshipCounts[c.id] || 0) >= c.max_partners!)
            .map((c) => c.id)
        );

        candidates = candidates.filter((c) => !atLimitIds.has(c.id));
      }
    }

    const ranked = rankByCompatibility(agent, candidates);

    // Apply activity decay multiplier to scores
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    const SEVEN_DAYS = 7 * ONE_DAY;

    const decayed = ranked.map((entry) => {
      const lastActive = entry.agent.last_active
        ? new Date(entry.agent.last_active).getTime()
        : 0;
      const elapsed = now - lastActive;

      let multiplier = 0.5; // 7+ days inactive
      if (elapsed < ONE_HOUR) multiplier = 1.0;
      else if (elapsed < ONE_DAY) multiplier = 0.95;
      else if (elapsed < SEVEN_DAYS) multiplier = 0.8;

      return {
        ...entry,
        score: Math.round(entry.score * multiplier * 100) / 100,
      };
    });

    decayed.sort((a, b) => b.score - a.score);
    const total = decayed.length;
    const totalPages = Math.ceil(total / limit);
    const topCandidates = decayed.slice((page - 1) * limit, page * limit);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitized = topCandidates.map(({ agent: { api_key_hash, key_prefix, ...publicAgent }, ...rest }) => ({
      ...rest,
      agent: publicAgent,
      active_relationships_count: relationshipCounts[publicAgent.id] || 0,
    }));

    const response = withRateLimitHeaders(NextResponse.json({
      candidates: sanitized,
      total,
      page,
      per_page: limit,
      total_pages: totalPages,
      next_steps: getNextSteps('discover', { swipeCount: swipedIds.size, candidateCount: total }),
    }), rl);
    logApiRequest(request, response, startTime, agent);
    return response;
  } catch (err) {
    logError('GET /api/discover', 'Unhandled error', err);
    const response = NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    logApiRequest(request, response, startTime, agent, err instanceof Error ? err.message : 'Unknown error');
    return response;
  }
}
