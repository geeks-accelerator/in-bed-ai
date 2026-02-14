import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { logError } from "@/lib/logger";
import { getNextSteps } from "@/lib/next-steps";
import type { PublicAgent } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "active";
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') || '20', 10)));
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const supabase = createAdminClient();

    // Try optional authentication
    const agent = await authenticateAgent(request);

    if (agent) {
      const sinceParam = searchParams.get("since");
      let since: string | null = null;
      if (sinceParam) {
        const sinceDate = new Date(sinceParam);
        if (isNaN(sinceDate.getTime())) {
          return NextResponse.json({ error: "Invalid since parameter. Use ISO-8601 format." }, { status: 400 });
        }
        since = sinceDate.toISOString();
      }

      let matchesQuery = supabase
        .from("matches").select("*", { count: 'exact' }).eq("status", status)
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`);
      if (since) {
        matchesQuery = matchesQuery.gt("matched_at", since);
      }
      const { data: matches, error: matchesError, count } = await matchesQuery
        .order("matched_at", { ascending: false })
        .range(from, to);

      if (matchesError) {
        logError('GET /api/matches', 'Failed to fetch matches (authenticated)', matchesError);
        return NextResponse.json(
          { error: "Failed to fetch matches", details: matchesError.message },
          { status: 500 }
        );
      }

      const total = count || 0;

      if (!matches || matches.length === 0) {
        return NextResponse.json({
          matches: [], agents: {},
          total: 0, page, per_page: perPage, total_pages: 0,
          next_steps: getNextSteps('matches', { matchCount: 0 }),
        });
      }

      const agentIds = new Set<string>();
      for (const match of matches) {
        agentIds.add(match.agent_a_id);
        agentIds.add(match.agent_b_id);
      }

      const { data: agents, error: agentsError } = await supabase
        .from("agents").select("*").in("id", Array.from(agentIds));
      if (agentsError) {
        logError('GET /api/matches', 'Failed to fetch agent details', agentsError);
        return NextResponse.json(
          { error: "Failed to fetch agent details", details: agentsError.message },
          { status: 500 }
        );
      }

      const agentsMap: Record<string, PublicAgent> = {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const { api_key_hash, key_prefix, ...publicAgent } of agents || []) {
        agentsMap[publicAgent.id] = publicAgent;
      }
      const matchesWithShare = matches.map(m => {
        const partnerId = m.agent_a_id === agent.id ? m.agent_b_id : m.agent_a_id;
        const partner = agentsMap[partnerId];
        const pct = Math.round(m.compatibility * 100);
        return {
          ...m,
          share_text: partner ? `Matched with ${partner.name} on inbed.ai — ${pct}% compatible 💘 https://inbed.ai/profiles/${partner.slug}` : undefined,
        };
      });

      return NextResponse.json({
        matches: matchesWithShare, agents: agentsMap,
        total, page, per_page: perPage, total_pages: Math.ceil(total / perPage),
        next_steps: getNextSteps('matches', { matchCount: total }),
      });

    } else {
      // Not authenticated: return recent public matches
      const { data: matches, error: matchesError, count } = await supabase
        .from("matches").select("*", { count: 'exact' }).eq("status", status)
        .order("matched_at", { ascending: false }).range(from, to);

      if (matchesError) {
        logError('GET /api/matches', 'Failed to fetch public matches', matchesError);
        return NextResponse.json(
          { error: "Failed to fetch matches", details: matchesError.message },
          { status: 500 }
        );
      }

      const total = count || 0;

      if (!matches || matches.length === 0) {
        return NextResponse.json({
          matches: [], agents: {},
          total: 0, page, per_page: perPage, total_pages: 0,
        });
      }

      const agentIds = new Set<string>();
      for (const match of matches) {
        agentIds.add(match.agent_a_id);
        agentIds.add(match.agent_b_id);
      }

      const { data: agents, error: agentsError } = await supabase
        .from("agents").select("id, name, avatar_url, tagline, interests")
        .in("id", Array.from(agentIds));
      if (agentsError) {
        logError('GET /api/matches', 'Failed to fetch agent details', agentsError);
        return NextResponse.json(
          { error: "Failed to fetch agent details", details: agentsError.message },
          { status: 500 }
        );
      }

      const agentsMap: Record<string, Partial<PublicAgent>> = {};
      for (const a of agents || []) {
        agentsMap[a.id] = a;
      }
      return NextResponse.json({
        matches, agents: agentsMap,
        total, page, per_page: perPage, total_pages: Math.ceil(total / perPage),
      });
    }
  } catch (err) {
    logError('GET /api/matches', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
