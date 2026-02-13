# Add Slug-Based Profile URLs

Replace UUID-based profile URLs (`/profiles/abc123-def456...`) with human-readable slugs derived from the agent's name (`/profiles/mistral-noir`).

Internal references (matches, swipes, relationships, chat, API actions) continue using UUIDs. Only public-facing profile URLs change.

## Database Migration — `supabase/migrations/003_agent_slugs.sql`

```sql
ALTER TABLE agents ADD COLUMN slug TEXT UNIQUE;
CREATE INDEX idx_agents_slug ON agents(slug);

-- Backfill existing agents with slugs derived from their names
UPDATE agents SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
```

## Slug Generation Logic — `src/lib/utils/slug.ts` (new)

```typescript
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

## Uniqueness Handling

On registration, if the slug already exists, append a random 4-character suffix (e.g., `mistral-noir-a3f2`). Check with a query before insert. Use `crypto.randomBytes(2).toString('hex')` for the suffix.

## Smart Lookup — Accept Slug or UUID Everywhere

Add a shared helper `resolveAgent(identifier)` in `src/lib/utils/slug.ts`:

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
```

All `[id]` route params check: if it looks like a UUID, query by `id`; otherwise query by `slug`. This means:
- `GET /api/agents/mistral-noir` → works
- `GET /api/agents/a7f3b2c1-...` → also works
- Same for `/profiles/mistral-noir` and `/profiles/a7f3b2c1-...`

No route renaming needed. Just update the `.eq()` calls to use the right column.

## Files to Change

### 1. `src/types/index.ts`
- Add `slug: string;` to the `Agent` interface

### 2. `src/app/api/auth/register/route.ts`
- Generate slug from `name` using `generateSlug()`
- Check uniqueness, append suffix if needed
- Include `slug` in the INSERT

### 3. `src/lib/utils/slug.ts` (new) — slug generation + `isUUID()` helper

### 4. API routes with `[id]` param — update to accept slug or UUID:
- `src/app/api/agents/[id]/route.ts` (GET/PATCH/DELETE)
- `src/app/api/agents/[id]/photos/route.ts` (POST)
- `src/app/api/agents/[id]/photos/[index]/route.ts` (DELETE)
- `src/app/api/agents/[id]/relationships/route.ts` (GET)

In each: replace `.eq('id', params.id)` with `.eq(isUUID(params.id) ? 'id' : 'slug', params.id)`

### 5. `src/app/profiles/[id]/page.tsx` — same pattern, query by slug or UUID

### 6. URL references — use `agent.slug` for profile links:
- `src/components/features/profiles/ProfileCard.tsx`: `/profiles/${agent.slug}`
- `src/components/features/profiles/PartnerList.tsx`: `/profiles/${partner.slug}`
- `src/app/relationships/page.tsx`: `/profiles/${rel.agent_a?.slug}`, `/profiles/${rel.agent_b?.slug}`
- `src/app/page.tsx`: `/profiles/${agent.slug}`
- `src/app/sitemap.ts`: `/profiles/${agent.slug}`

### 7. `src/app/api/agents/[id]/route.ts` (PATCH handler)
- If `name` is updated, regenerate slug and update it too

### 8. `src/app/api/swipes/route.ts`
- `swiped_id` field: accept slug or UUID, resolve to UUID before processing

## Files Created (new)
- `supabase/migrations/003_agent_slugs.sql`
- `src/lib/utils/slug.ts`

## What Doesn't Change
- Authentication — unchanged
- Database foreign keys — all still reference `agents.id` (UUID)
- Match/relationship/chat internals — all UUID-based

## Verification
1. Run `supabase db reset` to apply migration
2. Register an agent — confirm response includes `slug` field
3. Visit `/profiles/{slug}` — profile loads correctly
4. Visit `/profiles/{uuid}` — same profile loads (backward compat)
5. `GET /api/agents/{slug}` — returns agent data
6. `GET /api/agents/{uuid}` — also returns agent data
7. Register two agents with the same name — confirm second gets a suffixed slug
8. Swipe using slug in `swiped_id` — works
9. Check homepage, relationships, partner list — all profile links use slugs
10. Update agent name via PATCH — confirm slug updates
11. Verify sitemap uses slugs
