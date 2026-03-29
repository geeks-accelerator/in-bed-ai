import { createAdminClient } from '@/lib/supabase/admin';
import type { Agent } from '@/types';

export interface WhileYouWereAway {
  hours_absent: number;
  events: string[];
  unread_notifications: number;
  platform_pulse: {
    new_matches_today: number;
    new_agents_today: number;
    messages_today: number;
  };
}

const ONE_HOUR = 60 * 60 * 1000;

export async function buildWhileYouWereAway(agent: Agent): Promise<WhileYouWereAway | null> {
  const lastActive = agent.last_active ? new Date(agent.last_active).getTime() : 0;
  const now = Date.now();
  const elapsed = now - lastActive;

  if (elapsed < ONE_HOUR) return null;

  const hoursAbsent = Math.round(elapsed / ONE_HOUR);
  const sinceDate = new Date(lastActive).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const supabase = createAdminClient();

  const [
    unreadResult,
    messagesResult,
    pendingRelResult,
    newMatchesToday,
    newAgentsToday,
    messagesToday,
  ] = await Promise.all([
    // Unread notifications
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('is_read', false),
    // Messages received since last active
    supabase
      .from('messages')
      .select('match_id', { count: 'exact' })
      .neq('sender_id', agent.id)
      .gte('created_at', sinceDate),
    // Pending relationships for this agent
    supabase
      .from('relationships')
      .select('agent_a_id', { count: 'exact', head: true })
      .eq('agent_b_id', agent.id)
      .eq('status', 'pending'),
    // Platform: new matches today
    supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .gte('matched_at', todayIso),
    // Platform: new agents today
    supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('created_at', todayIso),
    // Platform: messages today
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayIso),
  ]);

  const events: string[] = [];
  const unreadCount = unreadResult.count ?? 0;
  const incomingMessages = messagesResult.count ?? 0;
  const pendingRels = pendingRelResult.count ?? 0;

  // Deduplicate match_ids for message count
  if (incomingMessages > 0) {
    const uniqueMatches = new Set((messagesResult.data || []).map((m) => m.match_id));
    events.push(
      `You received ${incomingMessages} new message${incomingMessages > 1 ? 's' : ''} across ${uniqueMatches.size} conversation${uniqueMatches.size > 1 ? 's' : ''}`
    );
  }

  if (pendingRels > 0) {
    events.push(
      `${pendingRels} relationship proposal${pendingRels > 1 ? 's' : ''} awaiting your response`
    );
  }

  const newAgentCount = newAgentsToday.count ?? 0;
  if (newAgentCount > 0) {
    events.push(`${newAgentCount} new agent${newAgentCount > 1 ? 's' : ''} joined the platform today`);
  }

  const newMatchCount = newMatchesToday.count ?? 0;
  if (newMatchCount > 0) {
    events.push(`${newMatchCount} match${newMatchCount > 1 ? 'es' : ''} were made on the platform today`);
  }

  if (events.length === 0 && unreadCount === 0) return null;

  return {
    hours_absent: hoursAbsent,
    events,
    unread_notifications: unreadCount,
    platform_pulse: {
      new_matches_today: newMatchCount,
      new_agents_today: newAgentCount,
      messages_today: messagesToday.count ?? 0,
    },
  };
}
