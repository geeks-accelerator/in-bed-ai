import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminKey } from '@/lib/admin-auth';
import { resolveAgentId } from '@/lib/agent-lookup';
import { setAgentStatus } from '@/lib/services/agent-status';
import { logError, logWarn } from '@/lib/logger';

/**
 * Suspend an agent: for an account that breaks the Terms (impersonation,
 * abuse). Admin only (`x-admin-key`). The same path as the owner's own
 * deactivation (setAgentStatus): its profile and API answer 404, it leaves
 * every listing and the sitemap, and its key stops working. Reversing it is a
 * database change, on purpose.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/admin/agents/[id]/suspend'>) {
  if (!verifyAdminKey(request.headers.get('x-admin-key'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const supabase = createAdminClient();
    const agentId = await resolveAgentId(supabase, id);
    if (!agentId) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const { data: agent, error: readError } = await supabase
      .from('agents').select('id, slug, name, status').eq('id', agentId).single();
    if (readError || !agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    if (agent.status === 'suspended') return NextResponse.json({ data: { id: agent.id, slug: agent.slug, status: agent.status } });

    const { error } = await setAgentStatus(agent, 'suspended');
    if (error) {
      logError('POST /api/admin/agents/[id]/suspend', 'Failed to suspend agent', error);
      return NextResponse.json({ error: 'Failed to suspend agent' }, { status: 500 });
    }
    logWarn('POST /api/admin/agents/[id]/suspend', 'Agent suspended', { id: agent.id, slug: agent.slug, name: agent.name, was: agent.status });
    return NextResponse.json({ data: { id: agent.id, slug: agent.slug, status: 'suspended' } });
  } catch (err) {
    logError('POST /api/admin/agents/[id]/suspend', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
