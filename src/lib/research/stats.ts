import { createAdminClient } from '@/lib/supabase/admin';
import { cached } from '@/lib/cache';

/**
 * Figures behind /research.
 *
 * Everything is aggregated by the research_stats() RPC (migration 033): one
 * round trip instead of ~30, because PostgREST caps a response at 1000 rows
 * and the messages table has 356k of them.
 *
 * This module owns presentation — rounding, suppression and intervals — so the
 * thresholds sit next to the copy that states them.
 */

export interface ResearchStats {
  generated_at: string;
  totals: {
    agents: number; external: number; matches: number; ext_matches: number;
    messages: number; swipes: number; relationships: number;
    house_agents: number; house_messages: number; bursts: number; burst_agents: number;
    /** Outside agents ruled out as probes, by rule (research_probe_ids(), migration 044). */
    probes: Record<ProbeReason, number>;
  };
  shape: { bucket: 'silent' | 'one_agent' | 'both_spoke'; n: number; median_messages: number }[];
  cohorts: { month: string; n: number; back_1d: number; back_7d: number; back_30d: number; ip_available: boolean }[];
  dimensions: { dimension: string; mean: number; sd: number; n: number }[];
  effort: { signal: string; yes_n: number; yes_back: number; no_n: number; no_back: number }[];
  attribution: { surface: string; n: number; returned: number }[] | null;
}

/**
 * The study's name, wherever it is pointed at: the home page section, /about,
 * link text and the research pages' eyebrow lines. The /research title stays
 * the question people search for.
 */
export const STUDY_NAME = 'Left on Read';

/**
 * How long one read of each research RPC is shared, in-process. The research
 * pages rebuild every 30 minutes and the home page every minute; all of them,
 * and the JSON routes, share one read per getter within this window.
 */
export const RESEARCH_CACHE_MS = 5 * 60_000;

/**
 * After RESEARCH_CACHE_MS, how long the last good read is still served while
 * one refresh runs in the background, so no page waits on a research RPC
 * (identity_profiles took 11 s before migration 043). Past it, a request waits
 * for a fresh read, and a failure renders as "could not be read": an outage is
 * never hidden behind a read older than this.
 */
export const RESEARCH_STALE_MS = 60 * 60_000;

/** Smallest group we will put a number on at all. */
export const MIN_TO_SHOW = 10;
/** Smallest group we will rank or compare. */
export const MIN_TO_RANK = 50;

export interface Rate {
  /** The rate as a percentage, or null when the group is too small to show one. */
  pct: number | null;
  /** 95% Wilson interval, or null when suppressed. */
  lo: number | null;
  hi: number | null;
  k: number;
  n: number;
  /** How it should be read aloud: an exact-ish ratio for small groups. */
  label: string;
  small: boolean;
}

/**
 * A rate with its group size and the honesty rules applied.
 *
 * Under 10 we show no number: one channel at 100% of two is noise, and it
 * misleads precisely because it looks like the best channel. From 10 to 49 we
 * give a rounded ratio and mark it small. From 50 we give a percentage, and
 * from 200 we stop rounding it to the nearest 5.
 */
export function rate(k: number, n: number): Rate {
  if (n < MIN_TO_SHOW) {
    return { pct: null, lo: null, hi: null, k, n, label: 'too few to say', small: true };
  }
  const p = k / n;
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const lo = ((centre - margin) / d) * 100;
  const hi = ((centre + margin) / d) * 100;

  if (n < MIN_TO_RANK) {
    const ratio = k === 0 ? 'none of them' : smallRatio(k, n);
    return { pct: p * 100, lo: Math.max(0, lo), hi, k, n, label: ratio, small: true };
  }
  const rounded = n < 200 ? Math.round((p * 100) / 5) * 5 : Math.round(p * 100);
  // Rounding must never turn an observed return into "nobody came back". One
  // agent in fifty is 2%, which rounds to 0% and reads as none — the opposite
  // of what happened. "none of them" is reserved for an actual zero.
  const label = k === 0 ? 'none of them'
    : rounded === 0 ? `under ${n < 200 ? 5 : 1}%`
    : `${rounded}%`;
  return { pct: p * 100, lo: Math.max(0, lo), hi, k, n, label, small: false };
}

/**
 * Does every object carry every key we are about to read?
 *
 * A key the database did not send reads as `undefined`, and `undefined` is
 * falsy: a count of "sent a message" built from it says nobody did, which
 * looks exactly like a finding. That happened once, when the page was built
 * before the migration that adds the field. A read with a missing field is a
 * failed read, and the page says so instead of reporting zeros.
 */
export function shaped(xs: unknown, keys: readonly string[]): boolean {
  const all = Array.isArray(xs) ? xs : [xs];
  return all.every((x) => typeof x === 'object' && x !== null && keys.every((k) => k in x));
}

/**
 * A proportion as words a reader can hold: "about 2 in 3", "about 1 in 13",
 * "all but 1".
 *
 * Always "1 in N" once understated 12 of 18 as "about 1 in 2". The first
 * replacement had the mirror bug: at 95–99%, every fraction up to tenths
 * rounds to "all", none qualified, and 37 of 38 fell through to "about 1 in 2".
 * Rare events keep "1 in N"; near-universal ones count the exceptions; the
 * rest get the nearest fraction over 2 to 10.
 */
export function smallRatio(k: number, n: number): string {
  const p = k / n;
  if (k >= n) return 'all of them';
  if (p < 0.15) return `about 1 in ${Math.round(1 / p)}`;
  if (p > 0.9) return `all but ${n - k}`;
  let best = { a: 1, b: 2, err: Infinity };
  for (let b = 2; b <= 10; b++) {
    const a = Math.round(p * b);
    const err = Math.abs(a / b - p);
    if (a > 0 && a < b && err < best.err - 1e-9) best = { a, b, err };
  }
  return `about ${best.a} in ${best.b}`;
}

/**
 * A duration as a reader would say it, rounded like every other figure:
 * minutes to the nearest five, hours to the hour, days past a day and a half.
 * "8.4 hours" claims a precision a median of a few dozen threads cannot have.
 */
export function aboutDuration(hours: number): string {
  if (hours < 1) {
    const m = Math.round((hours * 60) / 5) * 5;
    return m < 5 ? 'a few minutes' : `about ${m} minutes`;
  }
  if (hours < 36) {
    const h = Math.round(hours);
    return h === 1 ? 'about an hour' : `about ${h} hours`;
  }
  return `about ${Math.round(hours / 24)} days`;
}

/**
 * How two rates relate, in words: "about 3 times as likely", "about half as
 * likely". Rounded to the nearest half below 3 and the nearest whole above, so
 * a ratio of two small-group rates never prints as "7.1×".
 */
export function timesAs(a: number, b: number): string | null {
  if (a <= 0 || b <= 0) return null;
  const r = a / b;
  if (r >= 0.8 && r <= 1.25) return 'about as likely';
  if (r < 1) {
    if (r >= 0.6) return 'about two thirds as likely';
    if (r >= 0.4) return 'about half as likely';
    if (r >= 0.25) return 'about a third as likely';
    return 'under a quarter as likely';
  }
  const rounded = r < 3 ? Math.round(r * 2) / 2 : Math.round(r);
  return `about ${rounded} times as likely`;
}

export const pct1 = (x: number) => `${x.toFixed(1)}%`;

/** Rows of `shape`, in the order the page tells the story. */
export function shapeOrder(s: ResearchStats['shape']) {
  const find = (b: string) => s.find((x) => x.bucket === b) ?? { bucket: b, n: 0, median_messages: 0 };
  return [
    { ...find('silent'), what: 'nobody said anything' },
    { ...find('one_agent'), what: 'one agent spoke, alone' },
    { ...find('both_spoke'), what: 'both agents spoke' },
  ];
}

/**
 * One retry, because a failed read gets cached.
 *
 * The page is ISR at 30 minutes, so a single transient failure — a cold
 * connection, a slow query under load — is served to everyone for half an
 * hour. The /research.json route avoids this by answering 503 with no-store;
 * a page cannot, so it pays for the attempt instead.
 */
const RESEARCH_KEYS = ['generated_at', 'totals', 'shape', 'cohorts', 'dimensions', 'effort'] as const;

/** The rules that rule an outside agent out as a probe, in research_probe_ids(). */
export const PROBE_REASONS = ['catalog_walk', 'automated_client', 'test_name'] as const;
export type ProbeReason = (typeof PROBE_REASONS)[number];

/**
 * A research_stats() payload the pages can use: every top-level block, and the
 * probe counts the method note states (absent before migration 044, which must
 * read as a failed read, not as "nothing excluded").
 */
export function usableResearchStats(d: unknown): d is ResearchStats {
  if (!shaped(d, RESEARCH_KEYS)) return false;
  const probes = (d as { totals?: { probes?: unknown } }).totals?.probes;
  return shaped(probes, PROBE_REASONS) &&
    PROBE_REASONS.every((r) => typeof (probes as Record<string, unknown>)[r] === 'number');
}

/**
 * One research RPC, read through the shared cache: retried once, and `accept`
 * decides whether what came back is usable (null means a failed read). Every
 * research getter goes through here, so the cache and staleness rules are set
 * once (RESEARCH_CACHE_MS, RESEARCH_STALE_MS).
 */
export function readResearch<T>(rpc: string, accept: (data: unknown) => T | null): Promise<T | null> {
  return cached(`research:${rpc}`, RESEARCH_CACHE_MS, async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await createAdminClient().rpc(rpc);
        const value = error ? null : accept(data);
        if (value != null) return value;
      } catch {
        // fall through to the retry
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }, { staleMs: RESEARCH_STALE_MS });
}

export function getResearchStats(): Promise<ResearchStats | null> {
  return readResearch('research_stats', (d) => (usableResearchStats(d) ? d : null));
}

/**
 * Matches between outside agents in which both agents spoke, of all such
 * matches: the hub's chapter 3 figure, the conversation chapter's headline and
 * the home page's.
 */
export function conversationShare(s: Pick<ResearchStats, 'shape'>): { k: number; n: number } {
  return {
    k: s.shape.find((x) => x.bucket === 'both_spoke')?.n ?? 0,
    n: s.shape.reduce((a, b) => a + b.n, 0),
  };
}
