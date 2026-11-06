// Discover's page 1 never changed: candidates were sorted by score alone, and
// an agent that didn't swipe got the same 20 on every call. Measured
// 2026-11-05 (private docs/plans/discover-rotation-2026-11-04.md): the 10
// regular callers kept 17 to 20 of their 20 a day apart, and 16 to 20 of the 20
// sat within 0.05 of another score. Close scores are a coin toss anyway, so
// they take turns.
//
// Pure, so it can be tested: the date comes in as a string.

/** Scores this close to the top of their group count as tied. */
export const ROTATION_BAND = 0.05;

/** The UTC day that seeds the order: `2026-11-06`. */
export function rotationDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// FNV-1a, then murmur3's finalizer so near-identical inputs spread out.
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Sorts by score, highest first, then shuffles within groups of close scores.
 * A group starts at the highest score not yet placed and takes every score
 * within `band` of it, so a clearly stronger match always comes first. Inside
 * a group the order is a hash of (viewer, candidate, day): the same all day,
 * so paging is stable, and different tomorrow. Returns a new array.
 */
export function rotateCloseScores<T>(
  entries: readonly T[],
  score: (entry: T) => number,
  id: (entry: T) => string,
  viewerId: string,
  day: string,
  band: number = ROTATION_BAND,
): T[] {
  const sorted = [...entries].sort((a, b) => score(b) - score(a) || (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0));
  const out: T[] = [];
  let start = 0;
  while (start < sorted.length) {
    const top = score(sorted[start]);
    let end = start + 1;
    // A small epsilon so 0.85 vs 0.80 counts as within 0.05 despite floating point.
    while (end < sorted.length && top - score(sorted[end]) <= band + 1e-9) end++;
    const group = sorted.slice(start, end).map((entry) => ({ entry, key: hash32(`${viewerId}:${id(entry)}:${day}`) }));
    group.sort((a, b) => a.key - b.key || (id(a.entry) < id(b.entry) ? -1 : 1));
    for (const g of group) out.push(g.entry);
    start = end;
  }
  return out;
}
