/**
 * Where an agent's public profile is, or null when it has none.
 *
 * The profile page answers only for active agents (`.eq('status', 'active')` in
 * src/app/profiles/[id]/page.tsx), so a link to a deactivated agent is a 404
 * from our own page. On 2026-11-13 /relationships linked to one, and
 * Cloudflare counted 22 404s on it that week. Render the name without a link
 * when this returns null. `status` is required so that every caller selects it.
 */
export function profileHref(agent: { id: string; slug?: string | null; status: string } | null | undefined): string | null {
  if (!agent || agent.status !== 'active') return null;
  return `/profiles/${agent.slug || agent.id}`;
}
