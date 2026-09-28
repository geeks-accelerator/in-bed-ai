# Prod Review Fixes — 2026-09-28

Follow-up to the two-week production review (Sep 14–28, 2026). Prod is healthy — one
deployment since Sep 17, no restarts, ~0% error rate, memory flattening after the
admin-client leak fix — but the review surfaced issues worth fixing. A codebase audit
(same day) refined every item to reuse existing code and uncovered the root cause of the
unexplained notification failures plus one adjacent security bug (#5).

## Principles

- **Greenfield: no feature flags, no temporary instrumentation, no "phase 2 if needed".**
  Each fix is the final shape. Before/after measurement uses the Railway HTTP logs we
  already have (`railway logs --http --json`), not new timing code.
- **Reuse before adding.** Every item below names the existing function/pattern it builds
  on. New code is limited to one shared helper (`truncate`) and one DB function.
- **Fix root causes, not symptoms.**

| # | Issue | Severity | Reuses | Migration |
|---|---|---|---|---|
| 1 | Dashboard trusts unverified `getSession()` | Medium (security) | `authenticateBySession()` in `api-key.ts` | — |
| 2 | `/api/chat` slow (p50 ~2.1s, p95 ~5.2s) | Medium (perf) | rate-limit `Map` pattern; `try_create_match` RPC pattern | 028 |
| 3 | Error details never reach Railway logs | Medium (ops) | `logger.ts` (file sink kept — admin UI reads it) | — |
| 4 | Emoji-splitting truncation; 500 on malformed IDs | Medium (data loss) / Low | `sanitize.ts`, `isUUID()`, each route's existing 404 | — |
| 5 | `try_create_match` callable with the public anon key | **High (integrity)** | migration 025's REVOKE/GRANT pattern | 028 |

**Order:** #4 → #3 → #1 → #5 + #2 (one migration) — rationale in the rollout checklist.

---

## #1 — Dashboard trusts an unverified session (security)

### Problem

Four dashboard server components identify the user with `supabase.auth.getSession()` and
then query with the **service-role** admin client:

- `src/app/dashboard/layout.tsx:29`
- `src/app/dashboard/page.tsx:12`
- `src/app/dashboard/matches/page.tsx:12`
- `src/app/dashboard/chat/[matchId]/page.tsx:13`

On the server, `getSession()` decodes the cookie **without verifying the JWT signature**
(Supabase logged its warning 44× in 7 days). A forged cookie carrying a victim's
`auth_id` would render the victim's dashboard — profile, matches, private chats.
Read-only (all mutations go through API routes that verify via `getUser()`), and
`auth_id` hasn't been publicly readable since migration 025, hence Medium.

### Existing functionality to reuse

`src/lib/auth/api-key.ts:69` already has exactly the correct logic, private to the file:

```ts
async function authenticateBySession(): Promise<Agent | null> {
  // getUser() revalidates the JWT against the Auth server ...
  const { data: { user } } = await supabaseServer.auth.getUser();
  ... .from('agents').select('*').eq('auth_id', user.id).eq('status', 'active').single();
}
```

The dashboard re-implemented this (four copies) with the insecure call. No new file or
helper is needed.

### Fix

1. In `api-key.ts`, export the existing function, wrapped in React `cache()` so the
   dashboard layout + page share one Auth round-trip per request:
   ```ts
   export const getSessionAgent = cache(authenticateBySession);
   ```
   `authenticateAgent()` keeps calling `authenticateBySession()` directly (unchanged).
2. In each of the four dashboard files, replace the `createServerSupabaseClient()` +
   `getSession()` + agent-lookup block with:
   ```ts
   const agent = await getSessionAgent();
   if (!agent) redirect('/login');
   ```
   (`redirect()` stays outside try/catch.) Delete the now-unused
   `createServerSupabaseClient` imports; `matches/page.tsx` only needs `agent.id`,
   `chat/[matchId]/page.tsx` keeps its separate partner lookup.
3. **Leave alone:** `src/middleware.ts:28` (only refreshes cookies, never reads
   `session.user`; switching would add an Auth call to every request site-wide),
   `dashboard/notifications/page.tsx:26` and `components/ui/Navbar.tsx:25` (client
   components — UX redirects only; the API enforces auth).

### Verification

- `npx tsc --noEmit`, `npm run build`.
- Local: web login → all dashboard tabs load; logout → `/login`.
- Local negative test: cookie with a re-signed/unsigned JWT whose `sub` is another
  user's `auth_id` → redirects to `/login`.
- Prod: `railway logs --since 1d --filter '"getSession"'` → zero warnings.

---

## #2 — `/api/chat` is slow

### Problem

p50 ~2.1s / p95 ~5.2s, stable all week. Every call in the logs omits `since`, so it takes
the paginated branch (`per_page` default 20, max 50) and issues ~44 PostgREST requests:

- matches query + agents query
- **2 per match** in `enrichConversations()` (`src/app/api/chat/route.ts:135`): last
  message (`limit 1`) + exact `COUNT` of that match's messages (avg ~760 messages/match;
  heaviest agent has 49 active matches)
- `buildRoom(supabase, 'chat')` — platform-wide 24h counts

`buildRoom` has **12 call sites across 8 files** (`chat`, `chat/[matchId]/messages` ×2,
`discover`, `swipes`, `matches` ×3, `agents/me`, `agents/me/stats`, `dashboard/page`), and
every one of its five contexts returns **platform-wide** numbers — identical for every
caller — yet each request recomputes 2–4 count queries. This also taxes
`POST /api/chat/[matchId]/messages` (p50 ~980ms) and `/api/discover` (p50 ~1.5s).

### Fix A — Memoize `buildRoom` inside the function (zero call-site changes)

Reuse the module-level `Map` pattern from `src/lib/rate-limit.ts:44` (valid because
prod is a single Railway replica — documented in CLAUDE.md "Deployment"). In
`src/lib/engagement/social-traces.ts`:

- `const roomCache = new Map<RoomContext, { expires: number; value: Promise<Room | null> }>()`
- Store the **promise**, so concurrent misses share one query batch.
- 30s TTL. Keyspace is the fixed 5-member `RoomContext` union, so it can't grow.
- Evict on rejection so a transient DB error isn't cached.

All 12 call sites get the benefit unchanged.

### Fix B — One DB function for conversation summaries

Follow the existing RPC pattern (`supabase/migrations/011_atomic_match_creation.sql`,
called via `supabase.rpc()` in `src/app/api/swipes/route.ts:152`). New migration
`supabase/migrations/028_conversation_summaries.sql`:

```sql
CREATE OR REPLACE FUNCTION conversation_summaries(p_match_ids UUID[])
RETURNS TABLE (match_id UUID, last_message JSONB, message_count BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT m.id,
         (SELECT to_jsonb(msg) FROM messages msg
           WHERE msg.match_id = m.id
           ORDER BY msg.created_at DESC LIMIT 1),
         (SELECT count(*) FROM messages c WHERE c.match_id = m.id)
  FROM unnest(p_match_ids) AS m(id);
$$;

REVOKE EXECUTE ON FUNCTION conversation_summaries(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION conversation_summaries(UUID[]) TO service_role;
```

Both subqueries are served by the existing `idx_messages_match_created (match_id,
created_at)` from migration 001 (backward scan for the last message, index-only scan for
the count) — no new index.

`enrichConversations()` becomes two queries regardless of page size: the existing agents
query + `supabase.rpc('conversation_summaries', { p_match_ids })`, indexed by
`match_id`. The response shape is unchanged (`match`, `other_agent`, `last_message`,
`message_count`, `has_messages` — documented in `docs/API.md:1461–1520`). The `since`
branch keeps its in-memory filter; it's now one RPC call instead of up to ~100 queries,
so pushing that filter into SQL isn't worth the extra function surface.

**Decided against** denormalizing `message_count`/`last_message_at` onto `matches` with a
trigger: it adds a write-path trigger, a backfill, and drift risk to save work that the
existing index already makes cheap.

### Verification

- Diff `/api/chat` JSON before/after for the same agent locally (identical shape and
  ordering).
- Local timing at prod-like row counts (seed ~300k messages, as done for migration 026).
- ⚠️ `supabase db push` migration 028 to prod **before** the code deploys (CLAUDE.md
  Deployment section) — otherwise `/api/chat` 500s.
- Prod targets, from Railway HTTP logs: `/api/chat` p50 < 500ms, p95 < 1.5s;
  `/api/discover` and `POST .../messages` p50 visibly lower.

---

## #3 — Error details never reach Railway logs

### Problem

`logError()` (`src/lib/logger.ts:40`) writes full details (Postgres code, message, stack)
only to `logs/YYYY-MM-DD.log` and prints a detail-less headline to stdout.
`logWarn`/`logInfo` print nothing to stdout. Railway only indexes stdout, so prod error
details are effectively invisible.

### Existing functionality to keep

The file sink is **not dead code**: the admin UI reads it —
`src/app/admin/logs/page.tsx` → `src/app/api/admin/logs/files/route.ts` and
`.../files/[name]/route.ts`. (Files are ephemeral per deploy on Railway, but viewable
within a deployment's lifetime.) So the fix adds to stdout; it does not remove the file
sink or gate it by environment.

### Fix

In `logger.ts`, factor the details serialization that `appendToLog` already does
(`details instanceof Error ? { name, message, stack } : details`) into one
`serializeDetails()` used by both sinks, and extend it to keep Supabase
`PostgrestError` fields (`code`, `details`, `hint`). Then:

- `logError` → `console.error(JSON.stringify({ level: 'error', route, message, details }))`
- `logWarn` → same via `console.warn`
- `logInfo` → unchanged (file only; would be noise in Railway)

One JSON line per event so Railway indexes it as a single entry. `trackBackgroundError`
(`src/lib/background-errors.ts`) and `request-logger.ts` call `logError`, so they inherit
the fix.

### Verification

Local: POST a message to an inactive match → stdout line includes the error object.
Prod: next error in `railway logs --filter '@level:error'` shows `code`/`details`.

**Note:** the 8 unexplained `createNotification` failures that motivated this item are
now explained — see #4a.

---

## #4 — Unsafe truncation and malformed IDs

### 4a. Truncation splits emoji → dropped notifications, broken OG images

**Root cause (confirmed against prod data):** user text is truncated with
`String.prototype.slice()` / `charAt()`, which cut at UTF-16 code units. When the cut lands
inside an emoji (a surrogate pair), a lone high surrogate remains:

- **Dropped notifications.** `src/app/api/chat/[matchId]/messages/route.ts:138` builds
  the `new_message` notification body with `content.slice(0, 200)`. Postgres rejects the
  lone surrogate, the insert fails, and the recipient never gets the notification.
  **7 of the 8** `createNotification` failures this week had a high surrogate
  (`D83C`/`D83E`) at exactly code unit 199 of the triggering message. This is ongoing,
  silent data loss.
- **OG image errors.** `src/app/profiles/[id]/opengraph-image.tsx:65,67,122`
  (`bio.slice(0, 80)`, `name.charAt(0)`, `name.slice(0, 37)`) produce the lone surrogate
  that `@vercel/og` then tries to fetch a font for → Google Fonts returns 400
  (`Failed to load dynamic font for �`, 5× this week).
- **Same bug, other places:** `softMax()` in `src/lib/sanitize.ts:74` (on the **write**
  path for name/bio/tagline — a cut mid-emoji produces text Postgres rejects → 500 on
  register/profile update), `src/app/api/activity/route.ts:170`,
  `src/components/features/activity/ActivityFeed.tsx:241`, and initials via `charAt(0)` in
  `dashboard/layout.tsx:60` and `dashboard/matches/page.tsx:103,156`.

**Fix:** add one helper to the existing `src/lib/sanitize.ts` (it already owns text
safety), operating on code points:

```ts
/** Truncate to at most `max` code points without splitting surrogate pairs. */
export function truncate(text: string, max: number, suffix = ''): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('') + suffix;
}
```

- Use it at every site above (`truncate(content, 200, '...')`, etc.).
- `softMax()`: compute the cut with the same code-point logic, keeping its
  word-boundary behavior.
- Initials: `Array.from(name)[0]`.

No new sanitization rules, no data migration: stored data is already valid (the invalid
writes were rejected, not stored).

**Verify:** local message whose 200th code unit is mid-emoji → notification row created;
OG image for a name/bio cut mid-emoji → 200 with no font error;
`truncate('ab😀c', 3)` → `'ab😀'`.

### 4b. Malformed IDs return 500 instead of 404

The only 5xx in 7 days: `GET /api/chat/{{MATCH_ID}}/messages` (an agent sent its template
placeholder). The value hits a UUID column, Postgres raises `22P02`, and the route
returns 500 and logs an ERROR.

**Scope (corrected during implementation):** `matches/[id]`, `relationships/[id]`,
`notifications/[id]` and `POST chat/[matchId]/messages` already map *any* query error —
including `22P02` — to their 404 (`if (error || !row)`), so they never 500. Only
`GET /api/chat/[matchId]/messages` does: it queries `messages` by `match_id` and treats an
error as a server error.

**Fix:** in that one file, reuse `isUUID()` (`src/lib/utils/slug.ts`, already a guard in
`agents/[id]/relationships`, `agents/[id]/image-status`, `swipes`) and the file's
**existing** match-not-found response — hoisted into a module-level `matchNotFound()`
factory (a `Response` body can't be reused, hence a factory, not a const) that both the
new GET guard and the existing POST not-found branch return. No new shared helper, no
new copies.

**Verify:** `curl /api/chat/not-a-uuid/messages` → 404 with the same body as an unknown
match; no ERROR log line.

---

## #5 — `try_create_match` is callable with the public anon key (adjacent finding)

### Problem

Found while auditing the RPC pattern for #2. Postgres grants `EXECUTE` on new functions
to `PUBLIC` by default, and migration 011 never revoked it. **Verified on prod:**
`POST /rest/v1/rpc/try_create_match` with the anon key (shipped in the client bundle)
returns `200` (tested with nonexistent UUIDs, so nothing was created).

Impact: if agent A has liked agent B, anyone can call the function as
`(swiper=B, swiped=A)` and **force the A↔B match without B ever liking A**, with an
arbitrary `compatibility` score and breakdown. Swipes are publicly readable, so targets are
discoverable. This bypasses the core consent mechanic of the platform.

### Fix

In migration 028 (same file as #2, same grant pattern as migration 025):

```sql
REVOKE EXECUTE ON FUNCTION try_create_match(UUID, UUID, FLOAT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION try_create_match(UUID, UUID, FLOAT, JSONB) TO service_role;
```

The app only calls it via the service-role admin client (`swipes/route.ts:152`), so
nothing legitimate breaks.

**Forged-match audit (done 2026-09-28, read-only):** all 390 matches have `like` swipes
in both directions (checked against 5,847 like swipes) — the hole was never exploited. No
cleanup needed.

Also add to CLAUDE.md's Database section: new SQL functions must
`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` and grant `service_role`.

### Verification

After `supabase db push`: the same anon-key call → `401`/`403`; a real mutual like via
`POST /api/swipes` still creates a match.

---

## Out of scope / no action

- Vulnerability-scanner noise (`/wp-login.php`, `/.env`, `/.git/*`, Server Action `"x"`
  probes) — harmless 404s. The Sep 24 19:00 UTC p99 spike was one AWS IP (745 requests
  in an hour); no errors.
- Memory: 250 MB → ~430 MB over 11 days since Sep 17, flattening. Re-check next review.
  The `buildRoom` cache (#2) has a fixed 5-key keyspace, so it can't contribute.
- Profile soft-404 — accepted trade-off (note in `src/app/profiles/[id]/page.tsx`).

## Rollout checklist

1. [x] **#4a truncation** — local: emoji at code unit 199 → notification created.
2. [x] **#4b UUID guard** — local: `{{MATCH_ID}}` / `not-a-uuid` → 404.
3. [x] **#3 logger** — local: real `PostgrestError` logs `code`/`details` as one JSON line.
4. [x] **#1** `getSessionAgent` + 4 dashboard files — local: login works on all tabs;
       forged cookie rendered the victim's dashboard on the old code, redirects on the new.
   `buildRoom` memo ships with these (no migration dependency) — local: stale ≤30s, then refreshes.
5. [x] **Migration 028** (#5 revoke + #2 function) — verified locally (grants,
       counts/last message vs ground truth, index plan); applied to prod 2026-09-28.
       Prod: anon calls to `try_create_match` / `conversation_summaries` → 401 `42501`.
6. [x] **#2 `/api/chat` → RPC** — deployed after step 5. Prod, first ~hour:
       `/api/chat` p50 2190 → 843 ms, p95 5159 → 2065 ms (n=14 after; re-check with a
       larger sample). Missed the p50 < 500 ms target: every API-key request pays a
       cost-12 bcrypt compare, which is now the dominant fixed cost (the unauthenticated
       `GET .../messages` runs ~378 ms). Reducing that (e.g. a short-TTL in-memory cache
       of verified key → agent) is a separate security/perf decision, not part of this plan.
7. [x] **#5 audit** — 0 forged matches of 390; no cleanup needed.
8. [ ] 24h post-deploy check: no `createNotification` errors, no `getSession` warnings,
       no new 5xx, `/api/chat` p50 < 500ms.
