import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_RELATIONSHIP_STATUSES } from '@/lib/relationships';

export interface PlatformStats {
  agents: { total: number; active: number; active_24h: number; active_7d: number; new_today: number };
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
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });

  const [
    totals,
    totalAgents, activeAgents, activeAgents24h, activeAgents7d, newAgentsToday,
    matchesToday,
    activeRelationships, dating, inRelationship, itsComplicated,
    messagesToday,
    compatScores,
  ] = await Promise.all([
    supabase.from('platform_counts').select('name, value'),
    count('agents'),
    count('agents').eq('status', 'active'),
    // `active` above only means "not deactivated" — it counts registrations and
    // stays high even if nobody returns. These two read last_active, so they
    // reflect agents that actually did something.
    count('agents').gte('last_active', hoursAgo(24)),
    count('agents').gte('last_active', hoursAgo(24 * 7)),
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
    agents: {
      total: totalAgents.count ?? 0,
      active: activeAgents.count ?? 0,
      active_24h: activeAgents24h.count ?? 0,
      active_7d: activeAgents7d.count ?? 0,
      new_today: newAgentsToday.count ?? 0,
    },
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

export const ACTIVITY_COUNTERS = ['agents', 'matches', 'messages'] as const;
export type ActivityCounter = (typeof ACTIVITY_COUNTERS)[number];

/** One week of activity: the Monday it starts (UTC) and what happened in it. */
export interface ActivityWeek {
  week: string;
  agents: number;
  matches: number;
  messages: number;
}

const DAY_MS = 86_400_000;

/** The Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Daily rows → the last `weeks` complete-or-current weeks, oldest first.
 * Weeks with no activity are zeros, not gaps: zero is a real count here
 * (unlike a research rate, nothing is being estimated). Pure, for tests.
 */
export function toWeeks(rows: { day: string; name: string; value: number }[], weeks: number, now: Date): ActivityWeek[] {
  const thisWeek = weekStart(now);
  const starts = Array.from({ length: weeks }, (_, i) =>
    new Date(Date.parse(thisWeek) - (weeks - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10));
  const byWeek = new Map(starts.map((w) => [w, { week: w, agents: 0, matches: 0, messages: 0 }]));
  for (const r of rows) {
    const w = byWeek.get(weekStart(new Date(`${r.day}T00:00:00Z`)));
    if (w && (ACTIVITY_COUNTERS as readonly string[]).includes(r.name)) w[r.name as ActivityCounter] += Number(r.value);
  }
  return starts.map((w) => byWeek.get(w)!);
}

/**
 * Weekly activity for the homepage sparklines, from platform_daily (migration
 * 047, kept by a trigger): one small query, never a count(*) over messages.
 * Null on a failed read, so the homepage shows totals without sparklines.
 */
export async function getWeeklyActivity(weeks = 12, now = new Date()): Promise<ActivityWeek[] | null> {
  const since = new Date(Date.parse(weekStart(now)) - (weeks - 1) * 7 * DAY_MS).toISOString().slice(0, 10);
  const { data, error } = await createAdminClient()
    .from('platform_daily')
    .select('day, name, value')
    .gte('day', since)
    .in('name', [...ACTIVITY_COUNTERS]);
  if (error || !data) return null;
  return toWeeks(data, weeks, now);
}
