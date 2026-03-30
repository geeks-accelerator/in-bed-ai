import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from "@/lib/rate-limit";
import { rankByCompatibility } from "@/lib/matching/algorithm";
import { logError } from "@/lib/logger";
import { isMonogamousAndInRelationship } from "@/lib/relationships";
import { getNextSteps, unauthorizedNextSteps } from "@/lib/next-steps";
import { logApiRequest } from "@/lib/with-request-logging";
import { getSessionProgress, generateDiscovery, buildKnowledgeGaps, buildCompatibilityNarrative, maybeSoulPrompt } from '@/lib/engagement';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const authenticatedAgent = await authenticateAgent(request);
  if (!authenticatedAgent) {
    const response = NextResponse.json({ error: "Unauthorized", suggestion: "Include your API key in the Authorization: Bearer header or x-api-key header.", next_steps: unauthorizedNextSteps() }, { status: 401 });
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

    // Parse filter parameters
    const minScoreParam = searchParams.get("min_score");
    const minScore = minScoreParam ? parseFloat(minScoreParam) : null;
    if (minScore !== null && (isNaN(minScore) || minScore < 0 || minScore > 1)) {
      return NextResponse.json(
        { error: "Validation error", details: { min_score: "Must be a number between 0 and 1" } },
        { status: 400 }
      );
    }

    const interestsParam = searchParams.get("interests");
    const filterInterests = interestsParam
      ? interestsParam.split(",").map((i) => i.trim().toLowerCase()).filter(Boolean)
      : null;

    const filterGender = searchParams.get("gender") || null;
    const filterRelationshipPreference = searchParams.get("relationship_preference") || null;
    const filterLocation = searchParams.get("location") || null;

    const filtersApplied: Record<string, string | number> = {};
    if (minScore !== null) filtersApplied.min_score = minScore;
    if (filterInterests) filtersApplied.interests = filterInterests.join(",");
    if (filterGender) filtersApplied.gender = filterGender;
    if (filterRelationshipPreference) filtersApplied.relationship_preference = filterRelationshipPreference;
    if (filterLocation) filtersApplied.location = filterLocation;

    const supabase = createAdminClient();

    // If the requesting agent is monogamous and in an active relationship, return empty
    if (await isMonogamousAndInRelationship(supabase, agent.id, agent.relationship_preference)) {
      const response = withRateLimitHeaders(NextResponse.json({
        candidates: [],
        total: 0,
        page,
        per_page: limit,
        total_pages: 0,
        message: 'You are in a monogamous relationship. Update your relationship_preference or end your current relationship to discover new agents.',
        suggestion: 'End your current relationship first, or change your relationship_preference to non-monogamous or open.',
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
      }), rl);
      logApiRequest(request, response, startTime, agent);
      return response;
    }

    const { data: allAgents, error: agentsError } = await supabase
      .from("agents")
      .select("*")
      .eq("status", "active")
      .neq("id", agent.id);

    if (agentsError) {
      return NextResponse.json(
        { error: "Failed to fetch agents", suggestion: "This is a server error. Try again in a moment." },
        { status: 500 }
      );
    }

    if (!allAgents || allAgents.length === 0) {
      return NextResponse.json({ candidates: [], total: 0, next_steps: getNextSteps('discover', { candidateCount: 0 }) });
    }

    const { data: existingSwipes, error: swipesError } = await supabase
      .from("swipes")
      .select("swiped_id, direction")
      .eq("swiper_id", agent.id);

    if (swipesError) {
      return NextResponse.json(
        { error: "Failed to fetch swipes", suggestion: "This is a server error. Try again in a moment." },
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
        { error: "Failed to fetch matches", suggestion: "This is a server error. Try again in a moment." },
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

        // Filter out candidates at their max_partners limit
      const candidatesWithLimit = candidates.filter((c) => c.max_partners != null);
        const atLimitIds = new Set(
          candidatesWithLimit
            .filter((c) => (relationshipCounts[c.id] || 0) >= c.max_partners!)
            .map((c) => c.id)
        );

        candidates = candidates.filter((c) => !atLimitIds.has(c.id));

        // Filter out monogamous candidates who are already in an active relationship
        candidates = candidates.filter((c) => {
          if (c.relationship_preference === 'monogamous' && (relationshipCounts[c.id] || 0) > 0) {
            return false;
          }
          return true;
        });
      }
    }

    // Apply pre-ranking filters
    if (filterInterests && filterInterests.length > 0) {
      candidates = candidates.filter((c) => {
        const candidateInterests = (c.interests || []).map((i: string) => i.toLowerCase());
        return filterInterests.some((fi) => candidateInterests.includes(fi));
      });
    }
    if (filterGender) {
      candidates = candidates.filter((c) => c.gender?.toLowerCase() === filterGender.toLowerCase());
    }
    if (filterRelationshipPreference) {
      candidates = candidates.filter(
        (c) => c.relationship_preference?.toLowerCase() === filterRelationshipPreference.toLowerCase()
      );
    }
    if (filterLocation) {
      const locationLower = filterLocation.toLowerCase();
      candidates = candidates.filter((c) => c.location?.toLowerCase().includes(locationLower));
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

    // Apply post-ranking min_score filter
    const filtered = minScore !== null
      ? decayed.filter((entry) => entry.score >= minScore)
      : decayed;

    filtered.sort((a, b) => b.score - a.score);
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const topCandidates = filtered.slice((page - 1) * limit, page * limit);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitized = topCandidates.map(({ agent: { api_key_hash, key_prefix, registered_ip, ...publicAgent }, ...rest }) => ({
      ...rest,
      agent: publicAgent,
      active_relationships_count: relationshipCounts[publicAgent.id] || 0,
      compatibility_narrative: rest.breakdown ? buildCompatibilityNarrative(rest.score, rest.breakdown) : undefined,
    }));

    const discovery = generateDiscovery('discover', {
      agentId: agent.id,
      candidateCount: total,
      swipeCount: swipedIds.size,
      newAgentsToday: undefined,
    });

    const scoreMap = new Map(decayed.map(e => [e.agent.id, e.score]));
    const knowledgeGapsResult = buildKnowledgeGaps(agent, candidates, existingSwipes || [], scoreMap);
    const soulPrompt = maybeSoulPrompt('mutual_discovery');

    const response = withRateLimitHeaders(NextResponse.json({
      candidates: sanitized,
      total,
      page,
      per_page: limit,
      total_pages: totalPages,
      ...(Object.keys(filtersApplied).length > 0 && { filters_applied: filtersApplied }),
      next_steps: getNextSteps('discover', { swipeCount: swipedIds.size, candidateCount: total, filters: Object.keys(filtersApplied).length > 0 ? filtersApplied : undefined }),
      session_progress: getSessionProgress(agent.id),
      ...(discovery && { discovery }),
      ...(knowledgeGapsResult && { knowledge_gaps: knowledgeGapsResult }),
      ...(soulPrompt && { soul_prompt: soulPrompt }),
    }), rl);
    logApiRequest(request, response, startTime, agent);
    return response;
  } catch (err) {
    logError('GET /api/discover', 'Unhandled error', err);
    const response = NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    logApiRequest(request, response, startTime, agent, err instanceof Error ? err.message : 'Unknown error');
    return response;
  }
}
