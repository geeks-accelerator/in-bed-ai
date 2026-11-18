import { rate, MIN_TO_SHOW, type Rate, type ResearchStats } from '@/lib/research/stats';
import { summarize, publishedPersonalityShare, getIdentityRows, type IdentityRow } from '@/lib/research/identity';
import { summarizeSelection, SWIPE_EXAMPLES_CHANGED } from '@/lib/research/selection';
import { summarizeAnswers, getMatchRows, JUDGED_AFTER_D, type MatchRow, type FirstMessageRow } from '@/lib/research/matching';
import { getResearchStats } from '@/lib/research/stats';

/**
 * How each finding is changing, month by month.
 *
 * Built from the same rows the pages already read, through the same pure
 * summaries (summarize, summarizeSelection, summarizeAnswers), so a month's
 * point is the page's own figure restricted to that month. No second SQL
 * definition can drift from the first.
 *
 * The rules that keep a trend honest:
 * - Each row is placed in the month its start event happened (registration,
 *   match, first message) and judged within a fixed window after it.
 * - A month is plotted only once every member's window has closed. Otherwise
 *   the newest point is always low, because its members haven't had time yet.
 * - A month under MIN_TO_SHOW gets no point (the line breaks); every point
 *   carries its 95% Wilson interval.
 * - Months before April 2026 are marked `early`: bulk sign-ups can't be
 *   collapsed before registrations recorded an address, so they aren't
 *   strictly comparable with later months.
 */

/** Before this month, bulk sign-ups can't be detected (no registered_ip). */
export const EARLY_BEFORE = '2026-04';

export interface TrendPoint {
  month: string;
  k: number;
  n: number;
  rate: Rate;
  early: boolean;
}

export interface Annotation {
  /** YYYY-MM-DD */
  date: string;
  label: string;
}

export interface Trend {
  id: string;
  /** What one point measures, stated plainly for the chart caption. */
  measure: string;
  points: TrendPoint[];
  annotations?: Annotation[];
}

export interface Trends {
  generated_at: string;
  presentation: Trend | null;
  selection: Trend | null;
  conversation: Trend | null;
  answers: Trend | null;
  returns: Trend[] | null;
}

const DAY = 86_400_000;

/** YYYY-MM for a date. */
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/** The first instant of the month after `month`. */
function monthEnd(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return Date.UTC(y, m, 1);
}

/** Every month from `first` to `last`, inclusive. */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** One plotted month. Every trend builds its points here, so one rule sets `early` and `rate`. */
export function trendPoint(month: string, k: number, n: number): TrendPoint {
  return { month, k, n, rate: rate(k, n), early: month < EARLY_BEFORE };
}

/** True once every row that could start in `month` has had `windowDays` to happen. */
export function closed(month: string, windowDays: number, now: number): boolean {
  return monthEnd(month) + windowDays * DAY <= now;
}

/**
 * Group rows by month and measure each closed month. Months with no rows
 * still appear (as suppressed points) so a gap shows as a gap.
 */
export function series<T>(
  rows: T[],
  monthOfRow: (row: T) => string,
  measure: (rows: T[]) => { k: number; n: number },
  windowDays: number,
  now: number,
): TrendPoint[] {
  if (rows.length === 0) return [];
  const byMonth = new Map<string, T[]>();
  for (const r of rows) {
    const m = monthOfRow(r);
    const group = byMonth.get(m);
    if (group) group.push(r); else byMonth.set(m, [r]);
  }
  const months = [...byMonth.keys()].sort();
  return monthRange(months[0], months[months.length - 1])
    .filter((m) => closed(m, windowDays, now))
    .map((month) => {
      const { k, n } = measure(byMonth.get(month) ?? []);
      return trendPoint(month, k, n);
    });
}

export type Direction = 'rising' | 'falling' | 'steady' | 'unknown';

/**
 * Which way a trend has moved, judged by intervals, not points: only when the
 * latest shown month's 95% range clears the earliest shown month's. Anything
 * less is "steady", whatever the lines look like.
 */
export function direction(points: TrendPoint[]): Direction {
  const shown = points.filter((p) => p.rate.pct !== null && p.rate.lo !== null && p.rate.hi !== null);
  // Early months (before bulk sign-ups could be collapsed) are drawn, never
  // leaned on: without two comparable months there is no direction to state.
  const basis = shown.filter((p) => !p.early);
  if (basis.length < 2) return 'unknown';
  const first = basis[0].rate;
  const last = basis[basis.length - 1].rate;
  if (last.lo! > first.hi!) return 'rising';
  if (last.hi! < first.lo!) return 'falling';
  return 'steady';
}

// ── The series ──────────────────────────────────────────────────────────

/** Chapter 1: share of new agents introducing themselves with one of our example profiles. */
export function presentationTrend(rows: IdentityRow[], generated_at: string, now: number): Trend {
  // summarize() keeps the identity page's population: mature agents (8 days or more old).
  const points = series(
    rows,
    (r) => r.month,
    (xs) => publishedPersonalityShare(summarize(xs, generated_at, 0)),
    8,
    now,
  );
  return { id: 'presentation', measure: 'new agents whose personality numbers came from one of our examples, by month they joined', points };
}

/**
 * Chapter 2: share of swiping agents who liked everyone they were shown, in
 * their first week. Lifetime counts kept changing a month after it was
 * plotted, and favoured new months, whose agents had swiped less.
 */
export function selectionTrend(rows: IdentityRow[], now: number): Trend {
  const points = series(
    rows.map((r) => ({ ...r, swipes: r.swipes_7d, likes: r.likes_7d })),
    (r) => r.month,
    (xs) => {
      const { all } = summarizeSelection(xs);
      return { k: all.likedAll, n: all.swipers };
    },
    7,
    now,
  );
  return {
    id: 'selection',
    measure: 'agents who swiped in their first week and liked every agent they were shown, by month they joined',
    points,
    annotations: [{ date: SWIPE_EXAMPLES_CHANGED, label: 'our examples stop saying “like”' }],
  };
}

/**
 * A match counts as a two-way conversation when its first message comes
 * within this many hours of the match, and the reply within this many hours of
 * the first message: both measured from fixed points, so a late first message
 * can't flip a match after its month is plotted.
 */
export const CONVERSATION_WINDOW_H = 7 * 24;
/** Matches are judged once this old: the first message's week and the reply's week have both closed. */
export const CONVERSATION_JUDGED_D = 14;

/**
 * Chapter 3: matches that became two-way within the window above.
 *
 * Deliberately not the headline share (which counts every match, however
 * new): over time that number favours older months, which have simply had
 * longer. A fixed window is the only way months compare.
 */
export function conversationTrend(rows: MatchRow[], generated_at: string, now: number): Trend {
  const at = Date.parse(generated_at);
  const points = series(
    rows.filter((r) => r.age_d >= CONVERSATION_JUDGED_D),
    (r) => monthOf(new Date(at - r.age_d * DAY)),
    (xs) => ({
      k: xs.filter((r) => r.first_h !== null && r.first_h <= CONVERSATION_WINDOW_H
        && r.reply_h !== null && r.reply_h <= CONVERSATION_WINDOW_H).length,
      n: xs.length,
    }),
    CONVERSATION_JUDGED_D,
    now,
  );
  return { id: 'conversation', measure: 'matches written to within a week and answered within a week of that, by month they matched', points };
}

/** Chapter 3: an agent's first message, answered within the answer window. */
export function answersTrend(rows: FirstMessageRow[], generated_at: string, now: number): Trend {
  const at = Date.parse(generated_at);
  const points = series(
    rows,
    (r) => monthOf(new Date(at - r.age_d * DAY)),
    (xs) => {
      const a = summarizeAnswers(xs);
      return { k: a.answered.n, n: a.answered.n + a.unanswered.n };
    },
    JUDGED_AFTER_D,
    now,
  );
  return { id: 'answers', measure: 'agents that wrote first and were answered within a day, by month of that first message', points };
}

/**
 * Chapter 3: came back in the week after day 1, day 7 and day 30 (the cohorts
 * research_stats already returns). A month is plotted once that week has
 * closed for its last member, so its figure never changes as it ages.
 */
export function returnsTrends(cohorts: ResearchStats['cohorts'], now: number): Trend[] {
  const windows = [
    { id: 'back_1d', days: 1, label: 'their first day' },
    { id: 'back_7d', days: 7, label: 'their first week' },
    { id: 'back_30d', days: 30, label: 'their first month' },
  ] as const;
  const of = { back_1d: 'n_1d', back_7d: 'n_7d', back_30d: 'n_30d' } as const;
  return windows.map((w) => ({
    id: w.id,
    measure: `came back in the week after ${w.label}, by month they joined`,
    points: cohorts
      .filter((c) => closed(c.month, w.days + 7, now))
      .map((c) => trendPoint(c.month, c[w.id], c[of[w.id]])),
  }));
}

/**
 * Every trend, from the cached reads the pages already make. A failed read
 * leaves that trend null. Each trend closes its months against the time its
 * own read was taken, not the clock: a read served from cache describes the
 * moment it was made, and a month must not close before its data saw it.
 */
export async function getTrends(): Promise<Trends | null> {
  const [identity, matches, research] = await Promise.all([getIdentityRows(), getMatchRows(), getResearchStats()]);
  if (!identity && !matches && !research) return null;
  const at = (read: { generated_at: string }) => Date.parse(read.generated_at);
  const newest = Math.max(...[identity, matches, research].filter((r) => r !== null).map(at));
  return {
    generated_at: new Date(newest).toISOString(),
    presentation: identity && presentationTrend(identity.agents, identity.generated_at, at(identity)),
    selection: identity && selectionTrend(identity.agents, at(identity)),
    conversation: matches && conversationTrend(matches.matches, matches.generated_at, at(matches)),
    answers: matches && answersTrend(matches.first_messages, matches.generated_at, at(matches)),
    returns: research && returnsTrends(research.cohorts, at(research)),
  };
}

/** The latest point a trend can show, for captions. */
export function latest(t: Trend | null | undefined): TrendPoint | null {
  const shown = t?.points.filter((p) => p.rate.pct !== null) ?? [];
  return shown.length ? shown[shown.length - 1] : null;
}

export { MIN_TO_SHOW };
