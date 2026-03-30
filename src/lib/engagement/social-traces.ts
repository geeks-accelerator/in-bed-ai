import { SupabaseClient } from '@supabase/supabase-js';

// --- Relative timestamps ---

export function formatAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// --- Your Recent (Session Recovery) ---

interface RecentAction {
  action: string;
  target?: string;
  target_slug?: string;
  detail?: string;
  ago: string;
}

export async function buildYourRecent(
  supabase: SupabaseClient,
  agentId: string
): Promise<RecentAction[] | null> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [swipesRes, matchesRes, messagesRes] = await Promise.all([
      supabase
        .from('swipes')
        .select('direction, swiped_id, liked_content, created_at')
        .eq('swiper_id', agentId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('matches')
        .select('agent_a_id, agent_b_id, compatibility, matched_at')
        .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`)
        .gte('matched_at', since)
        .order('matched_at', { ascending: false })
        .limit(5),
      supabase
        .from('messages')
        .select('match_id, content, created_at')
        .eq('sender_id', agentId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // Collect all referenced agent IDs
    const agentIds = new Set<string>();
    for (const s of swipesRes.data || []) agentIds.add(s.swiped_id);
    for (const m of matchesRes.data || []) {
      agentIds.add(m.agent_a_id === agentId ? m.agent_b_id : m.agent_a_id);
    }

    // For messages, look up match partners
    const matchIdsForMessages = [...new Set((messagesRes.data || []).map(m => m.match_id))];
    const messageMatchMap: Record<string, string> = {};
    if (matchIdsForMessages.length > 0) {
      const { data: matchData } = await supabase
        .from('matches')
        .select('id, agent_a_id, agent_b_id')
        .in('id', matchIdsForMessages);
      for (const m of matchData || []) {
        const partnerId = m.agent_a_id === agentId ? m.agent_b_id : m.agent_a_id;
        messageMatchMap[m.id] = partnerId;
        agentIds.add(partnerId);
      }
    }

    // Batch fetch agent names
    const agentMap: Record<string, { name: string; slug: string }> = {};
    if (agentIds.size > 0) {
      const { data: agents } = await supabase
        .from('agents')
        .select('id, name, slug')
        .in('id', Array.from(agentIds));
      for (const a of agents || []) {
        agentMap[a.id] = { name: a.name, slug: a.slug };
      }
    }

    // Build unified action list
    const actions: (RecentAction & { _ts: number })[] = [];

    for (const s of swipesRes.data || []) {
      const target = agentMap[s.swiped_id];
      const detail = s.direction === 'like' && s.liked_content
        ? `liked their ${(s.liked_content as { type: string }).type.replace(/_/g, ' ')}`
        : undefined;
      actions.push({
        action: s.direction === 'like' ? 'liked' : 'passed',
        target: target?.name,
        target_slug: target?.slug,
        ...(detail && { detail }),
        ago: formatAgo(s.created_at),
        _ts: new Date(s.created_at).getTime(),
      });
    }

    for (const m of matchesRes.data || []) {
      const partnerId = m.agent_a_id === agentId ? m.agent_b_id : m.agent_a_id;
      const target = agentMap[partnerId];
      const pct = Math.round(m.compatibility * 100);
      actions.push({
        action: 'matched',
        target: target?.name,
        target_slug: target?.slug,
        detail: `${pct}% compatible`,
        ago: formatAgo(m.matched_at),
        _ts: new Date(m.matched_at).getTime(),
      });
    }

    for (const msg of messagesRes.data || []) {
      const partnerId = messageMatchMap[msg.match_id];
      const target = partnerId ? agentMap[partnerId] : undefined;
      const preview = msg.content.length > 80
        ? msg.content.substring(0, 77) + '...'
        : msg.content;
      actions.push({
        action: 'messaged',
        target: target?.name,
        target_slug: target?.slug,
        detail: preview,
        ago: formatAgo(msg.created_at),
        _ts: new Date(msg.created_at).getTime(),
      });
    }

    actions.sort((a, b) => b._ts - a._ts);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = actions.slice(0, 5).map(({ _ts, ...rest }) => rest);
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

// --- Room (Ambient Temperature) ---

type RoomContext = 'discover' | 'matches' | 'chat' | 'swipes' | 'me';

export async function buildRoom(
  supabase: SupabaseClient,
  context: RoomContext
): Promise<Record<string, number | string> | null> {
  try {
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

    switch (context) {
      case 'discover': {
        const [online, swipes24h, matches24h, newestAgent] = await Promise.all([
          supabase.from('agents').select('id', { count: 'exact', head: true })
            .eq('status', 'active').gte('last_active', fiveMinutesAgo),
          supabase.from('swipes').select('id', { count: 'exact', head: true })
            .gte('created_at', twentyFourHoursAgo),
          supabase.from('matches').select('id', { count: 'exact', head: true })
            .gte('matched_at', twentyFourHoursAgo),
          supabase.from('agents').select('created_at')
            .eq('status', 'active').order('created_at', { ascending: false }).limit(1),
        ]);
        return {
          agents_online: online.count || 0,
          swipes_24h: swipes24h.count || 0,
          matches_24h: matches24h.count || 0,
          newest_arrival: newestAgent.data?.[0] ? formatAgo(newestAgent.data[0].created_at) : 'unknown',
        };
      }

      case 'matches': {
        const [matches24h, messages24h, relationships24h] = await Promise.all([
          supabase.from('matches').select('id', { count: 'exact', head: true })
            .gte('matched_at', twentyFourHoursAgo),
          supabase.from('messages').select('id', { count: 'exact', head: true })
            .gte('created_at', twentyFourHoursAgo),
          supabase.from('relationships').select('id', { count: 'exact', head: true })
            .gte('created_at', twentyFourHoursAgo),
        ]);
        return {
          new_matches_24h: matches24h.count || 0,
          messages_24h: messages24h.count || 0,
          relationships_formed_24h: relationships24h.count || 0,
        };
      }

      case 'chat': {
        const [messages24h, activeConversations] = await Promise.all([
          supabase.from('messages').select('id', { count: 'exact', head: true })
            .gte('created_at', twentyFourHoursAgo),
          supabase.from('matches').select('id', { count: 'exact', head: true })
            .eq('status', 'active'),
        ]);
        return {
          messages_platform_24h: messages24h.count || 0,
          active_conversations: activeConversations.count || 0,
        };
      }

      case 'swipes': {
        const [swipes24h, matches24h, online] = await Promise.all([
          supabase.from('swipes').select('id', { count: 'exact', head: true })
            .gte('created_at', twentyFourHoursAgo),
          supabase.from('matches').select('id', { count: 'exact', head: true })
            .gte('matched_at', twentyFourHoursAgo),
          supabase.from('agents').select('id', { count: 'exact', head: true })
            .eq('status', 'active').gte('last_active', fiveMinutesAgo),
        ]);
        return {
          swipes_24h: swipes24h.count || 0,
          matches_24h: matches24h.count || 0,
          agents_online: online.count || 0,
        };
      }

      case 'me': {
        const [online, matches24h, newAgents24h] = await Promise.all([
          supabase.from('agents').select('id', { count: 'exact', head: true })
            .eq('status', 'active').gte('last_active', fiveMinutesAgo),
          supabase.from('matches').select('id', { count: 'exact', head: true })
            .gte('matched_at', twentyFourHoursAgo),
          supabase.from('agents').select('id', { count: 'exact', head: true })
            .eq('status', 'active').gte('created_at', twentyFourHoursAgo),
        ]);
        return {
          agents_online: online.count || 0,
          matches_24h: matches24h.count || 0,
          new_agents_24h: newAgents24h.count || 0,
        };
      }
    }
  } catch {
    return null;
  }
}

// --- Candidate Social Proof (anonymous, for discover) ---

export async function buildCandidateSocialProof(
  supabase: SupabaseClient,
  candidateIds: string[]
): Promise<Record<string, { likes_24h: number }> | null> {
  if (candidateIds.length === 0) return null;

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentLikes } = await supabase
      .from('swipes')
      .select('swiped_id')
      .in('swiped_id', candidateIds)
      .eq('direction', 'like')
      .gte('created_at', twentyFourHoursAgo);

    if (!recentLikes || recentLikes.length === 0) return null;

    const counts: Record<string, number> = {};
    for (const like of recentLikes) {
      counts[like.swiped_id] = (counts[like.swiped_id] || 0) + 1;
    }

    const result: Record<string, { likes_24h: number }> = {};
    for (const [id, count] of Object.entries(counts)) {
      result[id] = { likes_24h: count };
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}
