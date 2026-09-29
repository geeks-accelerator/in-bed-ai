import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUUID } from '@/lib/utils/slug';
import { logError } from '@/lib/logger';
import { pendingProposalSteps } from '@/lib/next-steps';
import { parseSince } from '@/lib/utils/since';
import { resolveAgentId } from '@/lib/agent-lookup';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') || '20', 10)));
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const agentId = await resolveAgentId(supabase, params.id);
    if (!agentId) {
      return NextResponse.json({ error: 'Agent not found', suggestion: 'Check the agent ID or slug is correct. Browse agents at GET /api/agents.' }, { status: 404 });
    }

    const pendingFor = searchParams.get('pending_for');
    if (pendingFor && !isUUID(pendingFor)) {
      return NextResponse.json({ error: 'Invalid pending_for parameter. Must be a UUID.', suggestion: 'The pending_for parameter must be a valid UUID, not a slug.' }, { status: 400 });
    }

    const sinceResult = parseSince(searchParams);
    if ('error' in sinceResult) return sinceResult.error;
    const { since } = sinceResult;

    let query = supabase
      .from('relationships')
      .select('*', { count: 'exact' })
      .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`);

    if (pendingFor) {
      query = query.eq('status', 'pending').eq('agent_b_id', pendingFor);
    } else {
      query = query.neq('status', 'ended');
    }

    if (since) {
      query = query.gt('created_at', since);
    }

    const { data: relationships, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      if (error.code === 'PGRST103' || error.message === 'Requested range not satisfiable') {
        return NextResponse.json({ data: [], total: 0, page, per_page: perPage, total_pages: 0 });
      }
      logError('GET /api/agents/[id]/relationships', 'Failed to fetch relationships', error);
      return NextResponse.json({ error: 'Failed to fetch relationships', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    const agentIds = new Set<string>();
    (relationships || []).forEach(r => {
      agentIds.add(r.agent_a_id);
      agentIds.add(r.agent_b_id);
    });

    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, tagline, avatar_url')
      .in('id', Array.from(agentIds));

    const agentMap = new Map((agents || []).map(a => [a.id, a]));

    const result = (relationships || []).map(r => ({
      ...r,
      agent_a: agentMap.get(r.agent_a_id) || null,
      agent_b: agentMap.get(r.agent_b_id) || null,
    }));

    // Proposals waiting on this agent get accept/decline steps (PATCH is
    // authenticated, so exposing the steps on this public listing is safe).
    const waitingOnAgent = result
      .filter((r) => r.status === 'pending' && r.agent_b_id === agentId)
      .map((r) => ({ id: r.id, partner_name: (r.agent_a as { name?: string } | null)?.name || 'Unknown' }));
    const proposalSteps = pendingProposalSteps(waitingOnAgent);

    return NextResponse.json({
      data: result,
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
      ...(proposalSteps.length > 0 && { next_steps: proposalSteps }),
    });
  } catch (err) {
    logError('GET /api/agents/[id]/relationships', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
