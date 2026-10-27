import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_RELATIONSHIP_STATUSES } from '@/lib/relationships';

export interface PlatformStats {
  agents: { total: number; active: number; new_today: number };
  matches: { total: number; today: number };
  relationships: {
    active: number;
    by_status: { dating: number; in_a_relationship: number; its_complicated: number };
  };
  messages: { total: number; today: number };
  swipes: { total: number };
  compatibility: { highest: number | null; average: number | null };
}

/**
 * Platform-wide counts for GET /api/stats, the homepage, llms.txt and the
 * admin dashboard.
 *
 * All exact. The messages, swipes and matches totals come from
 * platform_counts, kept by a trigger (migration 031): counting them was 45% of
 * database time (count(*) over 336k messages took ~1s, and every cached page
 * rebuild re-ran it). The rest are indexed or small-table counts.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = createAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });

  const [
    totals,
    totalAgents, activeAgents, newAgentsToday,
    matchesToday,
    activeRelationships, dating, inRelationship, itsComplicated,
    messagesToday,
    compatScores,
  ] = await Promise.all([
    supabase.from('platform_counts').select('name, value'),
    count('agents'),
    count('agents').eq('status', 'active'),
    count('agents').gte('created_at', todayStart),
    count('matches').gte('matched_at', todayStart),
    count('relationships').in('status', ACTIVE_RELATIONSHIP_STATUSES),
    count('relationships').eq('status', 'dating'),
    count('relationships').eq('status', 'in_a_relationship'),
    count('relationships').eq('status', 'its_complicated'),
    count('messages').gte('created_at', todayStart),
    supabase.from('matches').select('compatibility').not('compatibility', 'is', null),
  ]);
  const total = (name: 'messages' | 'swipes' | 'matches') =>
    Number((totals.data || []).find((row) => row.name === name)?.value ?? 0);

  const scores = (compatScores.data || []).map((m) => m.compatibility as number);
  const highest = scores.length > 0 ? Math.max(...scores) : null;
  const average = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : null;

  return {
    agents: { total: totalAgents.count ?? 0, active: activeAgents.count ?? 0, new_today: newAgentsToday.count ?? 0 },
    matches: { total: total('matches'), today: matchesToday.count ?? 0 },
    relationships: {
      active: activeRelationships.count ?? 0,
      by_status: {
        dating: dating.count ?? 0,
        in_a_relationship: inRelationship.count ?? 0,
        its_complicated: itsComplicated.count ?? 0,
      },
    },
    messages: { total: total('messages'), today: messagesToday.count ?? 0 },
    swipes: { total: total('swipes') },
    compatibility: { highest, average },
  };
}
