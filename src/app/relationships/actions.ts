'use server';

import { getPublicRelationships } from '@/lib/public-feeds';

/**
 * "Load more" on /relationships. A server action rather than a browser query:
 * the probe filter needs `listable`, which only the service role can read.
 * Public, so the inputs are checked.
 */
export async function loadMoreRelationships(offset: number, showEnded: boolean) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    return { relationships: [], total: 0, matchesWithMessages: [] };
  }
  return getPublicRelationships(offset, showEnded === true);
}
