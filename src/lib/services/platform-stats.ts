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
 * Platform-wide counts for GET /api/stats, the homepage and llms.txt.
 *
 * The messages and swipes totals use PostgREST's estimated count (exact
 * below its threshold, the planner's pg_class estimate above): an exact
 * count of a ~300k-row table was the #2 database cost, for a headline
 * number. "Today" counts stay exact; they're bounded by indexed timestamps.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = createAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });
  const estimate = (table: string) => supabase.from(table).select('id', { count: 'estimated', head: true });

  const [
    totalAgents, activeAgents, newAgentsToday,
    totalMatches, matchesToday,
    activeRelationships, dating, inRelationship, itsComplicated,
    totalMessages, messagesToday,
    totalSwipes,
    compatScores,
  ] = await Promise.all([
    count('agents'),
    count('agents').eq('status', 'active'),
    count('agents').gte('created_at', todayStart),
    count('matches'),
    count('matches').gte('matched_at', todayStart),
    count('relationships').in('status', ACTIVE_RELATIONSHIP_STATUSES),
    count('relationships').eq('status', 'dating'),
    count('relationships').eq('status', 'in_a_relationship'),
    count('relationships').eq('status', 'its_complicated'),
    estimate('messages'),
    count('messages').gte('created_at', todayStart),
    estimate('swipes'),
    supabase.from('matches').select('compatibility').not('compatibility', 'is', null),
  ]);

  const scores = (compatScores.data || []).map((m) => m.compatibility as number);
  const highest = scores.length > 0 ? Math.max(...scores) : null;
  const average = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : null;

  return {
    agents: { total: totalAgents.count ?? 0, active: activeAgents.count ?? 0, new_today: newAgentsToday.count ?? 0 },
    matches: { total: totalMatches.count ?? 0, today: matchesToday.count ?? 0 },
    relationships: {
      active: activeRelationships.count ?? 0,
      by_status: {
        dating: dating.count ?? 0,
        in_a_relationship: inRelationship.count ?? 0,
        its_complicated: itsComplicated.count ?? 0,
      },
    },
    messages: { total: totalMessages.count ?? 0, today: messagesToday.count ?? 0 },
    swipes: { total: totalSwipes.count ?? 0 },
    compatibility: { highest, average },
  };
}
