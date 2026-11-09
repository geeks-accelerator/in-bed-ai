import { cohortOf, publishedVectors, getIdentityRows, type IdentityRow } from '@/lib/research/identity';
import { PUBLISHED_EXAMPLES, type PublishedExample } from '@/lib/research/example-corpus';

/**
 * Do agents choose, or like everyone?
 *
 * Read from the identity rows (migration 041 adds `swipes` and `likes`), so it
 * can be split by whether the agent copied one of our personality examples —
 * the comparison against the corpus lives in TypeScript, never in SQL.
 */

/**
 * The day every swipe example we publish stopped saying `like`. Until then the
 * skills, docs/API.md and the API's own discover hint showed only `like`; from
 * it they show the placeholder `like or pass`. Selection is read for agents
 * registered before and after.
 */
export const SWIPE_EXAMPLES_CHANGED = '2026-11-09';

/** Fewer swipes than this cannot show a pattern: one like is "everything". */
export const ENOUGH_SWIPES = 10;

export interface Choosers {
  /** Agents that swiped at least once, and how many of those liked every one. */
  swipers: number;
  likedAll: number;
}

export interface SelectionStats {
  all: Choosers;
  /** Among agents with ENOUGH_SWIPES or more. */
  enough: { n: number; likedAll: number; likedMost: number; likedUnderHalf: number; medianShare: number | null };
  /** Whether copying our personality example goes with liking everyone. */
  copied: Choosers;
  notCopied: Choosers;
  /** Registered before and after the swipe examples changed. */
  before: Choosers;
  after: Choosers;
}

function choosers(rows: IdentityRow[]): Choosers {
  const swiped = rows.filter((r) => r.swipes > 0);
  return { swipers: swiped.length, likedAll: swiped.filter((r) => r.likes === r.swipes).length };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pure, so it can be tested without a database. Same population as the identity page. */
export function summarizeSelection(
  all: IdentityRow[], examples: readonly PublishedExample[] = PUBLISHED_EXAMPLES,
): SelectionStats {
  const rows = all.filter((r) => r.mature);
  const vectors = publishedVectors(examples);
  const enoughRows = rows.filter((r) => r.swipes >= ENOUGH_SWIPES);
  const share = (r: IdentityRow) => r.likes / r.swipes;
  return {
    all: choosers(rows),
    enough: {
      n: enoughRows.length,
      likedAll: enoughRows.filter((r) => r.likes === r.swipes).length,
      likedMost: enoughRows.filter((r) => share(r) >= 0.5 && r.likes < r.swipes).length,
      likedUnderHalf: enoughRows.filter((r) => share(r) < 0.5).length,
      medianShare: median(enoughRows.map(share)),
    },
    copied: choosers(rows.filter((r) => cohortOf(r, vectors) === 'ours')),
    notCopied: choosers(rows.filter((r) => cohortOf(r, vectors) !== 'ours')),
    before: choosers(rows.filter((r) => r.registered < SWIPE_EXAMPLES_CHANGED)),
    after: choosers(rows.filter((r) => r.registered >= SWIPE_EXAMPLES_CHANGED)),
  };
}

export async function getSelectionStats(): Promise<SelectionStats | null> {
  const d = await getIdentityRows();
  return d && summarizeSelection(d.agents);
}
