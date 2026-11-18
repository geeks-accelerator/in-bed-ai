'use server';

import { getPublicMatches } from '@/lib/public-feeds';
import { cursorFrom } from '@/lib/cursor';

/**
 * "Load more" on /matches. A server action rather than a browser query: the
 * probe filter needs `listable`, which only the service role can read.
 * Public, so the cursor is checked.
 */
export async function loadMoreMatches(before: string) {
  const cursor = cursorFrom(before);
  if (!cursor) return { matches: [], total: 0 };
  return getPublicMatches(cursor);
}
