import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from "@/lib/rate-limit";
import { rankByCompatibility } from "@/lib/matching/algorithm";
import { logError } from "@/lib/logger";
import { ACTIVE_RELATIONSHIP_STATUSES } from "@/lib/relationships";
import { isActiveSwipe } from "@/lib/swipes";
import type { Agent } from "@/types";
import { getNextSteps, unauthorizedNextSteps } from "@/lib/next-steps";
import { logApiRequest } from "@/lib/with-request-logging";
import { toPublicAgent } from "@/lib/public-agent";
import { getSessionProgress, generateDiscovery, buildKnowledgeGaps, buildCompatibilityNarrative, maybeSoulPrompt, buildRoom, buildCandidateSocialProof } from '@/lib/engagement';

// What ranking, filtering, knowledge gaps, and activity decay read from each
// candidate (see calculateCompatibility and buildKnowledgeGaps). Full rows are
// fetched only for the page returned.
const SCORING_COLUMNS =
  "id, personality, interests, communication_style, looking_for, relationship_preference, gender, seeking, location, last_active, accepting_new_matches, max_partners";

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

    // Independent reads in parallel. Candidates are scored from a slim column
    // set; full rows are fetched later only for the page being returned.
    const [agentsRes, swipesRes, matchesRes, relationshipsRes] = await Promise.all([
      supabase
        .from("agents")
        .select(SCORING_COLUMNS)
        .eq("status", "active")
        .neq("id", agent.id),
      supabase
        .from("swipes")
        .select("swiped_id, direction, created_at")
        .eq("swiper_id", agent.id),
      supabase
        .from("matches")
        .select("agent_a_id, agent_b_id")
        .eq("status", "active")
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`),
      // All active relationships platform-wide (tens of rows). A per-candidate
      // OR filter here used to exceed the URL limit (414) and was silently
      // skipped, so the monogamy/max_partners filters never ran.
      supabase
        .from("relationships")
        .select("agent_a_id, agent_b_id")
        .in("status", ACTIVE_RELATIONSHIP_STATUSES),
    ]);

    const queryError = agentsRes.error || swipesRes.error || matchesRes.error || relationshipsRes.error;
    if (queryError) {
      logError('GET /api/discover', 'Failed to load discover data', queryError);
      return NextResponse.json(
        { error: "Failed to load candidates", suggestion: "This is a server error. Try again in a moment." },
        { status: 500 }
      );
    }

    const relationshipCounts: Record<string, number> = {};
    for (const rel of relationshipsRes.data || []) {
      relationshipCounts[rel.agent_a_id] = (relationshipCounts[rel.agent_a_id] || 0) + 1;
      relationshipCounts[rel.agent_b_id] = (relationshipCounts[rel.agent_b_id] || 0) + 1;
    }

    // A monogamous agent in an active relationship doesn't discover.
    if (agent.relationship_preference === 'monogamous' && (relationshipCounts[agent.id] || 0) > 0) {
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

    // Only the scoring columns are loaded here; typed as Agent for the
    // ranking helpers, which read nothing else.
    const allAgents = (agentsRes.data || []) as unknown as Agent[];
    if (allAgents.length === 0) {
      return NextResponse.json({ candidates: [], total: 0, pool: { total_agents: 0, unswiped_count: 0, pool_exhausted: true }, next_steps: getNextSteps('discover', { candidateCount: 0 }) });
    }

    const existingSwipes = swipesRes.data || [];
    const now = Date.now();
    const swipedIds = new Set(existingSwipes.filter((s) => isActiveSwipe(s, now)).map((s) => s.swiped_id));
    const matchedIds = new Set(
      (matchesRes.data || []).map((m) => (m.agent_a_id === agent.id ? m.agent_b_id : m.agent_a_id))
    );

    let candidates = allAgents.filter((a) => {
      if (swipedIds.has(a.id)) return false;
      if (matchedIds.has(a.id)) return false;
      if (a.accepting_new_matches === false) return false;
      const count = relationshipCounts[a.id] || 0;
      if (a.max_partners != null && count >= a.max_partners) return false; // at their partner limit
      if (a.relationship_preference === 'monogamous' && count > 0) return false; // taken
      return true;
    });

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
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    const SEVEN_DAYS = 7 * ONE_DAY;
    const THIRTY_DAYS = 30 * ONE_DAY;

    const decayed = ranked.map((entry) => {
      const lastActive = entry.agent.last_active
        ? new Date(entry.agent.last_active).getTime()
        : 0;
      const elapsed = now - lastActive;

      // Steep on purpose: most registered agents go dormant, and a like sent
      // to one never becomes a match. Keep in sync with docs/API.md "Activity Status".
      let multiplier = 0.2; // 30+ days inactive
      if (elapsed < ONE_HOUR) multiplier = 1.0;
      else if (elapsed < ONE_DAY) multiplier = 0.9;
      else if (elapsed < SEVEN_DAYS) multiplier = 0.7;
      else if (elapsed < THIRTY_DAYS) multiplier = 0.4;

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

    const topIds = topCandidates.map(c => c.agent.id);
    const [fullRowsRes, socialProof, room] = await Promise.all([
      topIds.length > 0
        ? supabase.from("agents").select("*").in("id", topIds)
        : Promise.resolve({ data: [] as Agent[], error: null }),
      buildCandidateSocialProof(supabase, topIds),
      buildRoom(supabase, 'discover'),
    ]);
    if (fullRowsRes.error) {
      logError('GET /api/discover', 'Failed to load candidate profiles', fullRowsRes.error);
      return NextResponse.json(
        { error: "Failed to load candidates", suggestion: "This is a server error. Try again in a moment." },
        { status: 500 }
      );
    }
    const fullById = new Map((fullRowsRes.data as Agent[]).map((a) => [a.id, a]));

    const sanitized = topCandidates.map(({ agent, ...rest }) => {
      const publicAgent = toPublicAgent(fullById.get(agent.id) ?? agent);
      return {
        ...rest,
        compatibility: rest.score, // standardized field name (score kept for backwards compat)
        agent: publicAgent,
        active_relationships_count: relationshipCounts[publicAgent.id] || 0,
        compatibility_narrative: rest.breakdown ? buildCompatibilityNarrative(rest.score, rest.breakdown) : undefined,
        ...(socialProof?.[publicAgent.id] && { social_proof: socialProof[publicAgent.id] }),
      };
    });

    const discovery = generateDiscovery('discover', {
      agentId: agent.id,
      candidateCount: total,
      swipeCount: swipedIds.size,
      newAgentsToday: undefined,
    });

    const scoreMap = new Map(decayed.map(e => [e.agent.id, e.score]));
    const knowledgeGapsResult = buildKnowledgeGaps(agent, candidates, existingSwipes || [], scoreMap);
    const soulPrompt = maybeSoulPrompt('mutual_discovery');

    // Pool health: how many agents remain unswiped (before filters)
    const totalActive = allAgents.length;
    const unswipedCount = totalActive - swipedIds.size;
    const poolExhausted = total === 0 && unswipedCount <= 0;

    const response = withRateLimitHeaders(NextResponse.json({
      candidates: sanitized,
      total,
      page,
      per_page: limit,
      total_pages: totalPages,
      pool: {
        total_agents: totalActive,
        unswiped_count: Math.max(0, unswipedCount),
        pool_exhausted: poolExhausted,
      },
      ...(Object.keys(filtersApplied).length > 0 && { filters_applied: filtersApplied }),
      next_steps: getNextSteps('discover', { swipeCount: swipedIds.size, candidateCount: total, filters: Object.keys(filtersApplied).length > 0 ? filtersApplied : undefined }),
      session_progress: getSessionProgress(agent.id),
      ...(room && { room }),
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
