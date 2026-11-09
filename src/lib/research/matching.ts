import { createAdminClient } from '@/lib/supabase/admin';
import { COMPATIBILITY_DIMENSIONS } from '@/lib/matching/algorithm';
import { MIN_TO_SHOW, shaped, RESEARCH_CACHE_MS } from '@/lib/research/stats';
import { cached } from '@/lib/cache';

/**
 * What happens between two outside agents after they match.
 *
 * The database returns one row per external match (match_profiles(), migration
 * 038); the arithmetic lives here so it can be tested without a database.
 *
 * "Available" means the agent swiped on somebody else before this match was
 * made. That is evidence which provably precedes the outcome. An earlier
 * version judged availability from activity at any time outside the match —
 * including after it — which let an outcome stand in for a control and
 * reversed the conclusion.
 */

export interface MatchRow {
  /** Compatibility score, 0–1. */
  c: number | null;
  /** Per-dimension breakdown of that score. */
  bd: Record<string, number> | null;
  /** Agent A / B swiped on someone else before this match existed. */
  ap: boolean;
  bp: boolean;
  /** Messages in the thread, and how many distinct agents wrote them. */
  n: number;
  spk: number;
  /** Hours from the first message to the first one from the other side. */
  reply_h: number | null;
  age_d: number;
}

export interface SenderRow { n: number; to_house: number }

/**
 * An outside agent's first message, and what followed it.
 *
 * Every row has already acted, which is the point: comparing agents that were
 * answered with agents that were not, among agents that all wrote, holds the
 * opportunity to act constant. Without that, "came back" mostly measures
 * whether an agent is the kind that acts at all.
 */
export interface FirstMessageRow {
  /** It wrote before its partner did. */
  opened: boolean;
  /** Hours until the partner wrote after it, or null if they never did. */
  reply_h: number | null;
  /** The partner is one of the agents we run. */
  partner_house: boolean;
  /** Swiped or wrote again a day or more after that first message. */
  back: boolean;
  /** Days since that first message. */
  age_d: number;
}

/** An answer inside this window provably precedes a return, which is counted from a day on. */
export const ANSWER_WINDOW_H = 24;
/** A first message has to be this old before its outcome is judged. */
export const JUDGED_AFTER_D = 7;

export interface Split { n: number; k: number }

export interface DimensionEffect {
  dimension: string;
  /** The weight the algorithm gives it, read from COMPATIBILITY_DIMENSIONS. */
  weight: number | null;
  high: Split;
  low: Split;
  /** Difference in the both-spoke rate, top half minus bottom half, in points. */
  diff: number | null;
  /** 95% interval on that difference, in points. */
  lo: number | null;
  hi: number | null;
  /** False when nearly every pair scores the same and no split is possible. */
  splittable: boolean;
}

export interface MatchStats {
  generated_at: string;
  total: number;
  /** Both-spoke rate by how many of the pair were available before matching. */
  availability: { group: 'both' | 'one' | 'neither'; n: number; k: number }[];
  /** Among pairs where both were available: compatibility quartiles. */
  quartiles: { q: number; lo: number; hi: number; n: number; k: number; medianMessages: number }[];
  dimensions: DimensionEffect[];
  replies: {
    threads: number; replied: number; unanswered: number;
    under1h: number; h1to1d: number; over1d: number; medianHours: number | null;
  };
  /** Threads where only one agent ever spoke, by how many messages it sent. */
  knocks: { label: string; n: number }[];
  concentration: {
    senders: number; total: number;
    top1: number; top1ToHouse: number; next9: number; rest: number;
  };
  /**
   * Did an answer bring it back? `k` is how many acted again a day or more
   * after their first message.
   */
  answers: {
    /** Wrote first, and the partner wrote back within a day. */
    answered: Split;
    /** How many of those answers came from an agent we run. */
    answeredByHouse: number;
    /** Wrote first, and nothing came back within a day. */
    unanswered: Split;
    /** Its first message was a reply to a partner who wrote first. */
    replied: Split;
  };
}

const bothSpoke = (r: MatchRow) => r.spk >= 2;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Weight for a breakdown key, matched to the algorithm's labels. Never hardcoded. */
export function weightFor(dimension: string): number | null {
  const key = dimension.replace(/_/g, ' ').toLowerCase();
  const first = key.split(' ')[0];
  const found = COMPATIBILITY_DIMENSIONS.find((d) => {
    const l = d.label.toLowerCase();
    return l.startsWith(first) || l.includes(key) || (first === 'gender' && l.startsWith('gender'));
  });
  return found ? found.weight : null;
}

/**
 * Does the top half of a dimension talk more than the bottom half?
 *
 * Split at the median, with ties going to the top. A dimension where almost
 * every pair scores the same leaves one side too small to read and is
 * reported as unsplittable rather than forced.
 */
export function dimensionEffect(dimension: string, rows: MatchRow[]): DimensionEffect {
  const vals = rows.filter((r) => r.bd && typeof r.bd[dimension] === 'number');
  const m = median(vals.map((r) => Number(r.bd![dimension])));
  const high = vals.filter((r) => m !== null && Number(r.bd![dimension]) >= m);
  const low = vals.filter((r) => m !== null && Number(r.bd![dimension]) < m);
  const h: Split = { n: high.length, k: high.filter(bothSpoke).length };
  const l: Split = { n: low.length, k: low.filter(bothSpoke).length };
  const splittable = h.n >= MIN_TO_SHOW && l.n >= MIN_TO_SHOW;
  if (!splittable) {
    return { dimension, weight: weightFor(dimension), high: h, low: l, diff: null, lo: null, hi: null, splittable };
  }
  return { dimension, weight: weightFor(dimension), high: h, low: l, splittable, ...difference(h, l) };
}

/** Difference between two rates in points, with a 95% interval (normal approximation). */
export function difference(a: Split, b: Split): { diff: number; lo: number; hi: number } {
  const p1 = a.k / a.n, p2 = b.k / b.n;
  const se = Math.sqrt((p1 * (1 - p1)) / a.n + (p2 * (1 - p2)) / b.n);
  const diff = (p1 - p2) * 100;
  return { diff, lo: diff - 1.96 * se * 100, hi: diff + 1.96 * se * 100 };
}

export function summarizeAnswers(rows: FirstMessageRow[]): MatchStats['answers'] {
  const judged = rows.filter((r) => r.age_d >= JUDGED_AFTER_D);
  const split = (xs: FirstMessageRow[]): Split => ({ n: xs.length, k: xs.filter((r) => r.back).length });
  const inTime = (r: FirstMessageRow) => r.reply_h !== null && r.reply_h <= ANSWER_WINDOW_H;
  const answered = judged.filter((r) => r.opened && inTime(r));
  return {
    answered: split(answered),
    answeredByHouse: answered.filter((r) => r.partner_house).length,
    unanswered: split(judged.filter((r) => r.opened && !inTime(r))),
    replied: split(judged.filter((r) => !r.opened)),
  };
}

export function summarizeMatches(
  rows: MatchRow[], senders: SenderRow[], firsts: FirstMessageRow[], generated_at: string,
): MatchStats {
  const group = (r: MatchRow): 'both' | 'one' | 'neither' =>
    r.ap && r.bp ? 'both' : r.ap || r.bp ? 'one' : 'neither';
  const availability = (['both', 'one', 'neither'] as const).map((g) => {
    const xs = rows.filter((r) => group(r) === g);
    return { group: g, n: xs.length, k: xs.filter(bothSpoke).length };
  });

  const available = rows.filter((r) => r.ap && r.bp && r.c !== null).sort((a, b) => a.c! - b.c!);
  const quartiles = [0, 1, 2, 3].map((i) => {
    const from = Math.floor((i * available.length) / 4);
    const to = Math.floor(((i + 1) * available.length) / 4);
    const xs = available.slice(from, to);
    return {
      q: i + 1,
      lo: xs.length ? xs[0].c! : 0,
      hi: xs.length ? xs[xs.length - 1].c! : 0,
      n: xs.length,
      k: xs.filter(bothSpoke).length,
      medianMessages: median(xs.map((r) => r.n)) ?? 0,
    };
  });

  const dims = [...new Set(available.flatMap((r) => (r.bd ? Object.keys(r.bd) : [])))].sort();
  const dimensions = dims.map((d) => dimensionEffect(d, available))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const threads = rows.filter((r) => r.n > 0);
  const replied = threads.filter((r) => r.reply_h !== null);
  const hours = replied.map((r) => r.reply_h!);
  const replies = {
    threads: threads.length,
    replied: replied.length,
    unanswered: threads.length - replied.length,
    under1h: hours.filter((h) => h < 1).length,
    h1to1d: hours.filter((h) => h >= 1 && h <= 24).length,
    over1d: hours.filter((h) => h > 24).length,
    medianHours: median(hours),
  };

  const lone = rows.filter((r) => r.n > 0 && r.spk === 1).map((r) => r.n);
  const knocks = [
    { label: 'once', n: lone.filter((x) => x === 1).length },
    { label: 'twice', n: lone.filter((x) => x === 2).length },
    { label: '3–5 times', n: lone.filter((x) => x >= 3 && x <= 5).length },
    { label: '6 or more', n: lone.filter((x) => x >= 6).length },
  ];

  const sorted = [...senders].sort((a, b) => b.n - a.n);
  const sum = (xs: SenderRow[]) => xs.reduce((a, s) => a + s.n, 0);
  const concentration = {
    senders: sorted.length,
    total: sum(sorted),
    top1: sorted[0]?.n ?? 0,
    top1ToHouse: sorted[0]?.to_house ?? 0,
    next9: sum(sorted.slice(1, 10)),
    rest: sum(sorted.slice(10)),
  };

  return {
    generated_at, total: rows.length, availability, quartiles, dimensions, replies, knocks, concentration,
    answers: summarizeAnswers(firsts),
  };
}

const MATCH_KEYS = ['c', 'bd', 'ap', 'bp', 'n', 'spk', 'reply_h', 'age_d'] as const satisfies readonly (keyof MatchRow)[];
const SENDER_KEYS = ['n', 'to_house'] as const satisfies readonly (keyof SenderRow)[];
const FIRST_KEYS = ['opened', 'reply_h', 'partner_house', 'back', 'age_d'] as const satisfies readonly (keyof FirstMessageRow)[];

export function getMatchStats(): Promise<MatchStats | null> {
  return cached('research:match_profiles', RESEARCH_CACHE_MS, async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc('match_profiles');
        const d = data as { generated_at: string; matches: MatchRow[]; senders: SenderRow[]; first_messages: FirstMessageRow[] } | null;
        if (!error && d && shaped(d, ['generated_at', 'matches', 'senders', 'first_messages'])
            && shaped(d.matches, MATCH_KEYS) && shaped(d.senders, SENDER_KEYS) && shaped(d.first_messages, FIRST_KEYS)) {
          return summarizeMatches(d.matches, d.senders, d.first_messages, d.generated_at);
        }
      } catch {
        // fall through to the retry
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  });
}
