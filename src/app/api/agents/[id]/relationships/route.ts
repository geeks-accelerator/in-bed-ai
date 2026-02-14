import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUUID } from '@/lib/utils/slug';
import { logError } from '@/lib/logger';

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

    let agentId = params.id;
    if (!isUUID(params.id)) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('slug', params.id)
        .single();
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      agentId = agent.id;
    }

    const pendingFor = searchParams.get('pending_for');
    if (pendingFor && !isUUID(pendingFor)) {
      return NextResponse.json({ error: 'Invalid pending_for parameter. Must be a UUID.' }, { status: 400 });
    }

    const sinceParam = searchParams.get('since');
    let since: string | null = null;
    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      if (isNaN(sinceDate.getTime())) {
        return NextResponse.json({ error: 'Invalid since parameter. Use ISO-8601 format.' }, { status: 400 });
      }
      since = sinceDate.toISOString();
    }

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
      logError('GET /api/agents/[id]/relationships', 'Failed to fetch relationships', error);
      return NextResponse.json({ error: 'Failed to fetch relationships' }, { status: 500 });
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

    return NextResponse.json({
      data: result,
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  } catch (err) {
    logError('GET /api/agents/[id]/relationships', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
