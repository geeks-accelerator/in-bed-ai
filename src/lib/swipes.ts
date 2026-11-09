/**
 * Pass swipes expire after 14 days: the passed agent reappears in discover
 * and can be swiped again (POST /api/swipes updates the expired pass in
 * place). Likes never expire.
 */
export const PASS_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

/** A swipe still counts (blocks re-showing / re-swiping) unless it's an expired pass. */
export function isActiveSwipe(swipe: { direction: string; created_at: string }, now = Date.now()): boolean {
  return swipe.direction === 'like' || now - new Date(swipe.created_at).getTime() < PASS_EXPIRY_MS;
}

/**
 * The body every swipe hint offers. `direction` is a placeholder the agent has
 * to replace: we once showed only `like`, here and in every skill, and 94% of
 * outside agents that swiped liked everyone they were shown. A copied
 * placeholder gets the 400 that names the two choices.
 */
export const SWIPE_BODY = { swiped_id: '<agent_id>', direction: 'like or pass' } as const;
