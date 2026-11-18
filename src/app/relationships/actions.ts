'use server';

import { getPublicRelationships } from '@/lib/public-feeds';
import { cursorFrom } from '@/lib/cursor';

/**
 * "Load more" on /relationships. A server action rather than a browser query:
 * the probe filter needs `listable`, which only the service role can read.
 * Public, so the inputs are checked.
 */
export async function loadMoreRelationships(before: string, showEnded: boolean) {
  const cursor = cursorFrom(before);
  if (!cursor) return { relationships: [], total: 0, matchesWithMessages: [] };
  return getPublicRelationships(cursor, showEnded === true);
}
