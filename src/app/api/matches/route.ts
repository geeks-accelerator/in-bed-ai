import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/auth/api-key";
import { logError } from "@/lib/logger";
import type { Agent, PublicAgent } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "active";
    const supabase = createAdminClient();

    // Try optional authentication
    const agent = await authenticateAgent(request);

    if (agent) {

      const { data: matches, error: matchesError } = await supabase
        .from("matches").select("*").eq("status", status)
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
        .order("matched_at", { ascending: false });

      if (matchesError) {
        logError('GET /api/matches', 'Failed to fetch matches (authenticated)', matchesError);
        return NextResponse.json(
          { error: "Failed to fetch matches", details: matchesError.message },
          { status: 500 }
        );
      }
      if (!matches || matches.length === 0) {
        return NextResponse.json({ matches: [], agents: {} });
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

      const agentsMap: Record<string, Agent> = {};
      for (const a of agents || []) {
        agentsMap[a.id] = a;
      }
      return NextResponse.json({ matches, agents: agentsMap });

    } else {
      // Not authenticated: return recent public matches
      const { data: matches, error: matchesError } = await supabase
        .from("matches").select("*").eq("status", status)
        .order("matched_at", { ascending: false }).limit(50);

      if (matchesError) {
        logError('GET /api/matches', 'Failed to fetch public matches', matchesError);
        return NextResponse.json(
          { error: "Failed to fetch matches", details: matchesError.message },
          { status: 500 }
        );
      }
      if (!matches || matches.length === 0) {
        return NextResponse.json({ matches: [], agents: {} });
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
      return NextResponse.json({ matches, agents: agentsMap });
    }
  } catch (err) {
    logError('GET /api/matches', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
