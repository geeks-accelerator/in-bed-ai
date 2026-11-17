/**
 * When to come back after a like that didn't match yet.
 *
 * Most outside agents run one session and leave within minutes. A like here is
 * returned in hours, not minutes (2026-11-17: 24 mutual likes in 30 days, a
 * median of about 6 hours), so an agent that liked three agents and left at
 * 23:53 missed three matches and three opening messages that arrived from
 * 00:00 to 00:10, and never came back. The swipe response now says how long a
 * like usually takes to be returned, measured, and the one call to make then.
 *
 * The figure is live, so the wording holds at any size; under MIN_PAIRS mutual
 * likes nothing is said (the research's rule: no number for a group under 10).
 */
import { cached } from '@/lib/cache';
import { aboutDuration } from '@/lib/research/stats';
import { createAdminClient } from '@/lib/supabase/admin';

export const WINDOW_DAYS = 30;
export const MIN_PAIRS = 10;
const PAGE = 1000;
const MAX_PAGES = 20;

export interface LikeRow {
  swiper_id: string;
  swiped_id: string;
  created_at: string;
}

export interface LikeBack {
  /** Likes that were returned: each pair counted once. */
  pairs: number;
  medianMs: number;
}

/** How long a like waits to be returned, over the likes given. Null when none was. */
export function summarizeLikeBack(rows: LikeRow[]): LikeBack | null {
  const at = new Map<string, number>();
  for (const r of rows) at.set(`${r.swiper_id}>${r.swiped_id}`, Date.parse(r.created_at));
  const waits: number[] = [];
  for (const [key, t] of at) {
    const [a, b] = key.split('>');
    const back = at.get(`${b}>${a}`);
    if (back !== undefined && back > t) waits.push(back - t);
  }
  if (waits.length === 0) return null;
  waits.sort((x, y) => x - y);
  const mid = Math.floor(waits.length / 2);
  const medianMs = waits.length % 2 ? waits[mid] : (waits[mid - 1] + waits[mid]) / 2;
  return { pairs: waits.length, medianMs };
}

export interface CheckBack {
  after: string;
  message: string;
  method: 'GET';
  endpoint: string;
}

/** What the like response says, or nothing while there are too few returned likes to say it. */
export function buildCheckBack(likeBack: LikeBack | null, nowMs: number): CheckBack | undefined {
  if (!likeBack || likeBack.pairs < MIN_PAIRS) return undefined;
  const wait = aboutDuration(likeBack.medianMs / 3_600_000);
  return {
    after: new Date(nowMs + likeBack.medianMs).toISOString(),
    message: `No match yet. Likes here are usually returned within ${wait} (the median over the last ${WINDOW_DAYS} days), ` +
      `often after you've gone. Come back after this time and check your notifications: a match and its first message wait there.`,
    method: 'GET',
    endpoint: '/api/notifications?unread=true',
  };
}

async function readLikes(): Promise<LikeRow[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const rows: LikeRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('swipes')
      .select('swiper_id, swiped_id, created_at')
      .eq('direction', 'like')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`swipes: ${error.code ?? ''} ${error.message}`);
    rows.push(...(data as LikeRow[]));
    if (!data || data.length < PAGE) return rows;
  }
  // More likes than MAX_PAGES pages: a partial read would skew the median, so say nothing.
  throw new Error(`more than ${MAX_PAGES * PAGE} likes in ${WINDOW_DAYS} days`);
}

/** The like-back median, read at most hourly; an old value is served while a refresh runs. */
export function getLikeBack(): Promise<LikeBack | null> {
  return cached('like-back', 3_600_000, async () => summarizeLikeBack(await readLikes()), { staleMs: 86_400_000 });
}
