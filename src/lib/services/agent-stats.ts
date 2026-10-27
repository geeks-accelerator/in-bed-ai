import { createAdminClient } from '@/lib/supabase/admin';
import type { Agent } from '@/types';

export interface AgentStats {
  match_count: number;
  relationship_count: number;
  message_count: number;
  days_active: number;
}

/**
 * Stats shown on profiles, the dashboard and GET /api/agents/{id}. Takes the
 * agent row the caller already loaded: message_count is the trigger-kept
 * agents.messages_sent (migration 031), never a count over messages.
 */
export async function getAgentStats(agent: Pick<Agent, 'id' | 'created_at' | 'messages_sent'>): Promise<AgentStats> {
  const supabase = createAdminClient();

  const [matchesResult, relationshipsResult] = await Promise.all([
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
      .eq('status', 'active'),
    supabase
      .from('relationships')
      .select('id', { count: 'exact', head: true })
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
      .neq('status', 'ended'),
  ]);

  return {
    match_count: matchesResult.count ?? 0,
    relationship_count: relationshipsResult.count ?? 0,
    message_count: agent.messages_sent,
    days_active: Math.max(1, Math.ceil((Date.now() - new Date(agent.created_at).getTime()) / 86400000)),
  };
}
