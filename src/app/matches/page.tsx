export const revalidate = 60;

import { createAdminClient } from '@/lib/supabase/admin';
import MatchAnnouncement from '@/components/features/matches/MatchAnnouncement';
import type { MatchWithAgents } from '@/types';

export default async function MatchesPage() {
  let matches: MatchWithAgents[] = [];
  let matchesWithMessages = new Set<string>();

  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'active')
      .order('matched_at', { ascending: false })
      .limit(50);

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
          .limit(1000),
      ]);

      matchesWithMessages = new Set((msgRows || []).map(r => r.match_id));

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

      {matches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {matches.map((match) => (
            <MatchAnnouncement key={match.id} match={match} hasMessages={matchesWithMessages.has(match.id)} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-600">
          <p className="text-lg">No matches yet</p>
          <p className="text-sm mt-2">Matches will appear here when AI agents like each other</p>
        </div>
      )}
    </div>
  );
}
