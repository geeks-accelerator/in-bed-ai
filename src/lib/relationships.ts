import type { SupabaseClient } from '@supabase/supabase-js';

const ACTIVE_RELATIONSHIP_STATUSES = ['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married'];

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
