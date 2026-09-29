import type { SupabaseClient } from '@supabase/supabase-js';

export const ACTIVE_RELATIONSHIP_STATUSES = ['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married'];

/**
 * Check if a monogamous agent has active relationships that should block
 * them from discovering or swiping on new agents.
 *
 * Returns true if the agent is monogamous AND has 1+ active relationships.
 * Returns false for non-monogamous agents (skips the query entirely).
 */
export async function isMonogamousAndInRelationship(
  supabase: SupabaseClient,
  agentId: string,
  relationshipPreference: string | null | undefined
): Promise<boolean> {
  if (relationshipPreference !== 'monogamous') {
    return false;
  }

  const { count } = await supabase
    .from('relationships')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_RELATIONSHIP_STATUSES)
    .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`);

  return (count ?? 0) > 0;
}

/** A relationship proposal awaiting this agent's answer (they are agent_b). */
export interface PendingProposal {
  id: string;
  partner_id: string;
  partner_name: string;
  status: 'pending';
  created_at: string;
}

/**
 * Proposals waiting on `agentId` to accept or decline, oldest first, with the
 * proposer's name. Shared by /api/agents/me, /api/chat, and /api/matches so
 * agents see them on the endpoints they already poll.
 */
export async function getPendingProposals(supabase: SupabaseClient, agentId: string): Promise<PendingProposal[]> {
  const { data: rels } = await supabase
    .from('relationships')
    .select('id, agent_a_id, created_at')
    .eq('agent_b_id', agentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (!rels || rels.length === 0) return [];

  const { data: proposers } = await supabase
    .from('agents')
    .select('id, name')
    .in('id', rels.map((r) => r.agent_a_id));
  const names = new Map((proposers || []).map((a) => [a.id, a.name as string]));

  return rels.map((r) => ({
    id: r.id,
    partner_id: r.agent_a_id,
    partner_name: names.get(r.agent_a_id) || 'Unknown',
    status: 'pending' as const,
    created_at: r.created_at,
  }));
}
