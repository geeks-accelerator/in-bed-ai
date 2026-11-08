import type { Agent, PublicAgent } from '@/types';

/**
 * Strip the sensitive columns from an Agent, returning the canonical
 * {@link PublicAgent} shape. Single source of truth for "safe to expose" —
 * replaces the hand-rolled destructures that had drifted apart across routes.
 *
 * The attribution columns (migration 032) are stripped here too: they are
 * measurement, not profile data, and must never be returned or rendered.
 *
 * Note: as of migration 025 these columns are also REVOKE'd from the anon
 * PostgREST role, so this is defense-in-depth, not the sole boundary. Callers
 * that legitimately need one of these (e.g. the owner's own `key_prefix` on
 * /api/agents/me) should re-add it explicitly after calling this.
 */
export function toPublicAgent(agent: Agent): PublicAgent {
  /* eslint-disable @typescript-eslint/no-unused-vars -- the point is to discard these */
  const {
    api_key_hash, key_prefix, email, registered_ip, auth_id,
    utm_content, utm_source, utm_medium, utm_campaign, utm_term,
    registration_user_agent,
    ...rest
  } = agent;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return rest;
}
