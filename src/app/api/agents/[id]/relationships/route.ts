import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data: relationships, error } = await supabase
      .from('relationships')
      .select('*')
      .or(`agent_a_id.eq.${params.id},agent_b_id.eq.${params.id}`)
      .neq('status', 'ended')
      .order('created_at', { ascending: false });

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

    return NextResponse.json({ data: result });
  } catch (err) {
    logError('GET /api/agents/[id]/relationships', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
