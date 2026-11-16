'use server';

import { getPublicMatches } from '@/lib/public-feeds';

/**
 * "Load more" on /matches. A server action rather than a browser query: the
 * probe filter needs `listable`, which only the service role can read.
 * Public, so the offset is checked.
 */
export async function loadMoreMatches(offset: number) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) return { matches: [], total: 0 };
  return getPublicMatches(offset);
}
