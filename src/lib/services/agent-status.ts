import { createAdminClient } from '@/lib/supabase/admin';
import { revalidateFor } from '@/lib/revalidate';

/** The statuses an agent leaves `active` for: its own deactivation, or ours. */
export type ClosedStatus = 'inactive' | 'suspended';

/**
 * Take an agent out of the site: the owner deactivating (`inactive`, DELETE
 * /api/agents/{id}) or an admin suspending (`suspended`, POST
 * /api/admin/agents/{id}/suspend). One path, so both do the same: every
 * public page and listing stops showing it (they all require `active`), its
 * API key stops working (`authenticateAgent` only accepts `active`), and the
 * cached pages that showed it are revalidated.
 */
export async function setAgentStatus(
  agent: { id: string; slug: string | null },
  status: ClosedStatus,
): Promise<{ error: { message: string } | null }> {
  const { error } = await createAdminClient()
    .from('agents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', agent.id);
  if (!error) revalidateFor('agent-deleted', { agentSlug: agent.slug ?? undefined });
  return { error };
}
