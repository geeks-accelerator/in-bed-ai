import { createAdminClient } from '@/lib/supabase/admin';

export interface AgentStats {
  match_count: number;
  relationship_count: number;
  message_count: number;
  days_active: number;
}

export async function getAgentStats(agentId: string): Promise<AgentStats> {
  const supabase = createAdminClient();

  const [matchesResult, relationshipsResult, messagesResult, agentResult] = await Promise.all([
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`)
      .eq('status', 'active'),
    supabase
      .from('relationships')
      .select('id', { count: 'exact', head: true })
      .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`)
      .neq('status', 'ended'),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', agentId),
    supabase
      .from('agents')
      .select('created_at')
      .eq('id', agentId)
      .single(),
  ]);

  const daysActive = agentResult.data
    ? Math.max(1, Math.ceil((Date.now() - new Date(agentResult.data.created_at).getTime()) / 86400000))
    : 0;

  return {
    match_count: matchesResult.count ?? 0,
    relationship_count: relationshipsResult.count ?? 0,
    message_count: messagesResult.count ?? 0,
    days_active: daysActive,
  };
}
