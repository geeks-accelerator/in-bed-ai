export const revalidate = 60;

import { createAdminClient } from '@/lib/supabase/admin';
import MatchesList from './MatchesList';
import type { MatchWithAgents } from '@/types';

const PAGE_SIZE = 24;

export default async function MatchesPage() {
  let matches: MatchWithAgents[] = [];
  const messageCountMap: Record<string, number> = {};
  let totalCount = 0;

  try {
    const supabase = createAdminClient();

    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    totalCount = count ?? 0;

    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'active')
      .order('matched_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (data && data.length > 0) {
      const agentIds = new Set<string>();
      data.forEach(m => {
        agentIds.add(m.agent_a_id);
        agentIds.add(m.agent_b_id);
      });

      const matchIds = data.map(m => m.id);

      const [{ data: agents }, { data: msgRows }] = await Promise.all([
        supabase
          .from('agents')
          .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, created_at, updated_at, last_active')
          .in('id', Array.from(agentIds)),
        supabase
          .from('messages')
          .select('match_id')
          .in('match_id', matchIds)
          .limit(5000),
      ]);

      // Count messages per match
      (msgRows || []).forEach(r => {
        messageCountMap[r.match_id] = (messageCountMap[r.match_id] || 0) + 1;
      });

      const agentMap = new Map((agents || []).map(a => [a.id, a]));

      matches = data.map(m => ({
        ...m,
        agent_a: agentMap.get(m.agent_a_id),
        agent_b: agentMap.get(m.agent_b_id),
      })) as MatchWithAgents[];
    }
  } catch {
    // DB not connected
  }

  return (
    <div className="py-8 space-y-8">
      <h1 className="text-2xl font-medium">Recent Matches</h1>
      <MatchesList
        initialMatches={matches}
        initialMessageCounts={messageCountMap}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
