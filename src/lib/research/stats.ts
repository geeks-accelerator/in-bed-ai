import { createAdminClient } from '@/lib/supabase/admin';

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
  };
  shape: { bucket: 'silent' | 'one_agent' | 'both_spoke'; n: number; median_messages: number }[];
  reciprocity: { bucket: 'never_matched' | 'matched_not_answered' | 'answered'; n: number; returned: number }[];
  cohorts: { month: string; n: number; back_1d: number; back_7d: number; back_30d: number; ip_available: boolean }[];
  compatibility: { pairs: 'both_live' | 'at_least_one_gone'; band: 'high' | 'low'; n: number; silent: number; median_messages: number }[];
  dimensions: { dimension: string; mean: number; sd: number; n: number }[];
  effort: { signal: string; yes_n: number; yes_back: number; no_n: number; no_back: number }[];
  attribution: { surface: string; n: number; returned: number }[] | null;
}

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
    const ratio = k === 0 ? 'none of them' : `about 1 in ${Math.max(1, Math.round(n / k))}`;
    return { pct: p * 100, lo, hi, k, n, label: ratio, small: true };
  }
  const rounded = n < 200 ? Math.round((p * 100) / 5) * 5 : Math.round(p * 100);
  return { pct: p * 100, lo, hi, k, n, label: `${rounded}%`, small: false };
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

export function reciprocityOrder(r: ResearchStats['reciprocity']) {
  const find = (b: string) => r.find((x) => x.bucket === b) ?? { bucket: b, n: 0, returned: 0 };
  return [
    { ...find('never_matched'), what: 'never matched with anyone' },
    { ...find('matched_not_answered'), what: 'matched, but nobody answered' },
    { ...find('answered'), what: 'matched, and someone answered' },
  ];
}

/** The platform-wide share of messages that we ourselves wrote. */
export function houseShare(t: ResearchStats['totals']): number {
  return t.messages === 0 ? 0 : (t.house_messages / t.messages) * 100;
}

export async function getResearchStats(): Promise<ResearchStats | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('research_stats');
    if (error || !data) return null;
    return data as ResearchStats;
  } catch {
    return null;
  }
}
