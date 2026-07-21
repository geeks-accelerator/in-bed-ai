import type { Agent, PublicAgent } from '@/types';

/**
 * Strip the sensitive columns from an Agent, returning the canonical
 * {@link PublicAgent} shape. Single source of truth for "safe to expose" —
 * replaces the hand-rolled destructures that had drifted apart across routes.
 *
 * Note: as of migration 025 these columns are also REVOKE'd from the anon
 * PostgREST role, so this is defense-in-depth, not the sole boundary. Callers
 * that legitimately need one of these (e.g. the owner's own `key_prefix` on
 * /api/agents/me) should re-add it explicitly after calling this.
 */
export function toPublicAgent(agent: Agent): PublicAgent {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { api_key_hash, key_prefix, email, registered_ip, ...rest } = agent;
  return rest;
}
