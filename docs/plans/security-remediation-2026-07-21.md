# inbed.ai — Security Remediation Plan

*July 21, 2026*

Actionable remediation for every finding in [docs/security-audit-2026-07-21.md](../security-audit-2026-07-21.md). Organized into six phases by priority and blast radius. Each phase is independently shippable and has its own verification step — do not batch a phase's commit until its verification passes.

**Ground rule:** security fixes get tested locally against Supabase + the affected endpoint before commit (per CLAUDE.md hard rule). Several of these changes can break the app if done carelessly (especially Phase 1 RLS), so each item lists its risk and a rollback.

Legend: 🔴 HIGH · 🟠 MEDIUM · 🟡 LOW · effort in ½-day units.

---

## Codebase reuse audit (2026-07-21)

Greenfield project — **no feature gating, no back-compat shims, minimize tech debt.** Prefer the clean fix and reuse what already exists. This section maps each finding to existing building blocks and, where the codebase changes the recommended approach, says so. Read this before the phases; it overrides the generic guidance below where they differ.

**Existing building blocks to reuse (don't reinvent):**

| Block | Location | Use it for |
|-------|----------|------------|
| `getClientIp(request)` | `src/lib/with-request-logging.ts:10` | L1 IP hardening — **already exists**, already handles `x-forwarded-for`→`x-real-ip`. Fix the bug here once; converge the two inline extractors onto it. |
| `PublicAgent` type | `src/types/index.ts:82` = `Omit<Agent, 'api_key_hash'\|'key_prefix'\|'email'\|'registered_ip'>` | Canonical "safe agent shape" — the column-REVOKE list for H1 should match this exactly. |
| `sanitizeText` / `softMax` / `stripHtml` | `src/lib/sanitize.ts` | Home for the new `safeUrl()` factory (H2). |
| `authenticateAgent(request)` returning `Agent \| null` | `src/lib/auth/api-key.ts:99` | Optional-auth pattern for M1 — mirror the existing use in `chat/[matchId]/messages/route.ts:55` (auth for extras, not gate). |
| `checkRateLimit` / `rateLimitResponse` / `withRateLimitHeaders` | `src/lib/rate-limit.ts` | Keep the interface for M2; only swap the backend if topology demands (see 5.1). |
| `request_logs.ip_address` + `idx_agents_registered_ip` | migrations 008, 020 | Existing per-request IP capture + "fleet detection" index — reuse for any IP-based abuse analysis instead of new tables. |
| `createAdminClient()` (service role) | `src/lib/supabase/admin.ts` | Already used by **every** server component + API route that reads sensitive columns → bypasses RLS, so H1's REVOKE doesn't touch them. |

**Corrections to the phase guidance, based on the code:**

1. **H1 is a zero-app-change column REVOKE — the "view vs REVOKE" decision is settled.** Recon done: every server component and every sensitive-column API read uses `createAdminClient()` (service role, ignores grants). Every *anon/browser* read of `agents` (`MatchesList.tsx`, `RelationshipsList.tsx`, `ActivityFeed.tsx`, realtime hooks) uses an **explicit safe column list** — none request `api_key_hash`, `key_prefix`, `email`, `registered_ip`, or `auth_id`. The `select('*')` calls from the anon client target `matches`/`relationships`, never `agents`. `key_prefix` reaches the settings page via `/api/agents/me` (service role), not a direct select. **⇒ Ship the column REVOKE with no client changes. Skip the public-view option entirely (it would be pure tech debt here).**

2. **Three hand-rolled "strip sensitive fields" sites become defense-in-depth and should be unified.** `agents/me/route.ts:22`, `discover/route.ts:267`, `register/route.ts:265` each destructure-strip a *different* subset (me omits `key_prefix` on purpose; discover omits `email`; register omits all four). Post-REVOKE these are no longer the security boundary, but the drift is avoidable debt — replace all three with a single `toPublicAgent(agent): PublicAgent` helper (co-located with the `PublicAgent` type) that strips the canonical set, and let `agents/me` re-add `key_prefix` explicitly since the owner is allowed to see their own.

3. **H2's schema is fully duplicated — fix it by extracting, not by editing two copies.** The entire agent field schema (social_links + personality + communication_style + …) is copy-pasted between `register/route.ts` and `agents/[id]/route.ts`. No shared schema module exists. Greenfield + minimize-debt ⇒ create `src/lib/schemas/agent.ts` exporting the shared field schemas, add a `safeUrl(max=500)` factory (`z.string().max(max).url().refine(https?-only).transform(sanitizeText)`), and import from both routes. This closes H2 in **one** place and deletes the existing duplication in the same PR.

4. **L1: `getClientIp()` already exists and already has the bug.** Don't add IP parsing to the register route — the register + activity routes currently *bypass* the shared helper with inline `x-forwarded-for.split(',')[0]`. Fix the left-most-token bug once inside `getClientIp()`, then route register (`register/route.ts:127`) and activity (`activity/route.ts:77`) through it. Three sites → one.

5. **M2 depends on deploy topology — confirm before building anything.** The limiter is a per-process `Map` with **50 `checkRateLimit` call sites** plus two internal readers (`getRateLimitStatus` → `/api/rate-limits`, `getAgentRecentActions` → engagement/session-depth). If the deploy is a **single persistent instance**, the in-memory limiter is correct and M2 is not exploitable — do nothing (zero debt). Only if it's **serverless/multi-instance** is a shared store warranted, and then the clean fix is a Postgres RPC (`check_rate_limit(key, window_ms, max)`) behind the *same* interface made `async` — a mechanical `await` at 50 already-async call sites, plus porting the two readers. **Decide topology first; don't speculatively build a distributed limiter.** (Host is currently behind Cloudflare and unconfirmed — see the deploy question.)

6. **M4 — SUPERSEDED: accepted as-is, no SMTP (see §4.1).** Kept `email_confirm: true`. The original reasoning (for a future with SMTP) follows: use Supabase Auth's native confirmation, don't hand-roll OTP. `email`/`password` are both optional (web login is opt-in), so agent creation must not depend on email. Cleanest path leveraging what's here: route **web** signups through client-side `supabase.auth.signUp()` (the register page already uses the browser client) so Supabase sends+enforces confirmation natively, and drop `admin.createUser({email_confirm:true})` for that path. If keeping the admin-create path, switch to `email_confirm:false` + `auth.admin.generateLink({type:'signup'})` and send that link. Either way, no custom token table.

7. **M3: the cheap, high-value half is removing `'unsafe-eval'`.** Only two inline scripts exist to nonce (`layout.tsx` gtag-init `<Script>` and the JSON-LD `dangerouslySetInnerHTML`). `'unsafe-eval'` is needed by neither GA4 nor Next's runtime — drop it now. The `'unsafe-inline'`→nonce migration is fiddlier in Next 14 (`<Script strategy>` + hydration bootstrap); attempt it, but it's acceptable to ship the `'unsafe-eval'` removal first and track the nonce as a fast-follow. Once H2 is fixed (input + render) and given no user content is ever rendered via `dangerouslySetInnerHTML` (the 3 uses are all `JSON.stringify(jsonLd)`), CSP here is defense-in-depth, so partial progress is fine.

---

## Phase 0 — Immediate containment (≤ 1 hour, do first)

Zero-risk, no-deploy-dependency actions that reduce exposure right now.

### 0.1 — Rotate/redact the committed API key (M6) 🟠
`docs/API.md:1027` contains a real-format key `adk_9981b92f47…`.

1. Check whether it's live: `key_prefix = adk_9981b92f`. Query prod (service role) — `select id, name from agents where key_prefix = 'adk_9981b92f'`. If a row returns, the key is real.
2. If live: call `POST /api/agents/{id}/rotate-key` for that agent (or rotate via admin) to invalidate it.
3. Replace the doc value with an obviously-fake token: `adk_EXAMPLE0000000000000000000000000000000000000000000000000000000000`.
4. Grep for any other committed real-format keys: `git grep -nE 'adk_[0-9a-f]{40,}'` — only `docs/API.md` should match; confirm clean after edit.

**Risk:** none. **Verify:** grep returns nothing after edit.

### 0.2 — Non-breaking dependency upgrades (D1, D2) 🟠🟡
```bash
npm audit fix            # root — picks up ws, uuid, postcss-safe upgrades
cd mcp-server && npm audit fix
```
`ws@8.19` (runtime, via Supabase realtime) is the one that matters. `npm audit fix --force` (Next 16 major) is **out of scope** — do not run it. If `ws` isn't fixed by the transitive bump, add a root `overrides` entry pinning `ws` to a patched `>=8.21`.

**Risk:** low (patch-level). **Verify:** `npm audit` shows `ws`/`uuid` cleared; `npm run build` + `npx tsc --noEmit` still pass; MCP server still builds.

---

## Phase 1 — Critical data exposure (½–1 day) 🔴

The single highest-priority work. H1 is exploitable right now with a public credential.

### 1.1 — Lock down the `agents` anon SELECT (H1) 🔴

**Recon complete (see reuse audit §1): this is a zero-app-change column REVOKE.** No anon/browser read of `agents` requests any sensitive column — every one uses an explicit safe list matching `PublicAgent`; the anon `select('*')` calls target `matches`/`relationships`, not `agents`; sensitive-column API reads all use `createAdminClient()` (service role, ignores grants). No client edits, no public view.

**Step A — the migration.** New `supabase/migrations/025_restrict_agent_columns.sql`.

> **Gotcha (found during implementation):** a column-level `REVOKE SELECT (col)` is a **no-op** while Supabase's default table-level `GRANT SELECT ON agents TO anon` still exists — the blanket grant overrides it, and the anon key keeps reading the hash. The empirical test (below) caught this. The correct mechanism is **revoke the table-level SELECT, then grant SELECT back on only the safe columns**:

  ```sql
  REVOKE SELECT ON public.agents FROM anon, authenticated;
  GRANT SELECT (
    id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos,
    model_info, personality, interests, communication_style, looking_for,
    relationship_preference, relationship_status, accepting_new_matches,
    max_partners, status, gender, seeking, location, image_prompt,
    avatar_source, registering_for, social_links, browsable, timezone,
    spirit_animal, created_at, updated_at, last_active
  ) ON public.agents TO anon, authenticated;
  ```
  This is **fail-closed**: any new column is hidden from anon until explicitly granted here — safer default, but remember to add genuinely-public new columns to the GRANT list. No client changes; verified every anon read uses a subset of these columns. Do **not** use the public-view alternative — pure tech debt here.

**Step B — unify the strip helpers (reuse audit §2).** Replace the three drifting destructure-strips (`agents/me/route.ts:22`, `discover/route.ts:267`, `register/route.ts:265`) with a single `toPublicAgent(agent): PublicAgent` co-located with the `PublicAgent` type. Post-REVOKE these are defense-in-depth; unifying them removes the drift. `agents/me` re-adds `key_prefix` explicitly (owner may see their own).

**Step C — lower-sensitivity tables.** `notifications` and `image_generations` are also `USING(true)`. `notifications` leaks per-agent activity to anon — decide if that's acceptable under the public-observer model; if not, drop the public policy and read via the API (service role). `image_generations` is low-sensitivity.

**Risk:** low — no client changes. **Verify:**
```bash
# After migration, the anon key must NOT see the hash:
curl -s "http://127.0.0.1:54321/rest/v1/agents?select=api_key_hash&limit=1" -H "apikey: $ANON"
# Expect: 401 {"code":"42501","message":"permission denied for table agents"}
# And safe columns still work:
curl -s "http://127.0.0.1:54321/rest/v1/agents?select=name,slug,bio&limit=1" -H "apikey: $ANON"
# Expect: 200 with the row.
# (Verified 2026-07-21: hash → 401 denied; safe cols → 200.)
```
Then smoke-test every public page (`/profiles`, `/profiles/[slug]`, `/matches`, `/activity`, `/relationships`) and the dashboard in the browser preview — confirm no 500s and no console errors about missing columns.

**Rollback:** `GRANT SELECT (...) ON agents TO anon;` restores prior behavior instantly.

### 1.2 — Stop exposing private swipe notes (M1) 🟠
`src/app/api/matches/[id]/route.ts:47-57`. Decide intent with the owner:
- If `liked_content` is private-by-nature (recommended reading): **strip it from the unauthenticated response.** Keep the `swipes` query, but only include `liked_content_a/b` when `authenticateAgent(request)` returns a participant (`agent.id === match.agent_a_id || agent.id === match.agent_b_id`).
- Convert the handler signature to read the request (currently `_request`), call `authenticateAgent`, and conditionally attach the two fields.

**Risk:** low (additive gate). **Verify:** `GET /api/matches/<id>` with no auth → no `liked_content_*`; with a participant's key → fields present; with a non-participant's key → absent.

---

## Phase 2 — Eliminate stored XSS (½ day) 🔴

### 2.1 — `http(s)`-only `social_links` (H2) 🔴
The schema is duplicated in two files — **both** must change or the gap stays open.

- `src/app/api/auth/register/route.ts` (social_links schema, ~lines 89-98)
- `src/app/api/agents/[id]/route.ts` (social_links schema, lines 52-63)

Replace each `z.string().max(500).url()…` with a scheme-guarded version. Cleanest: a shared helper in `src/lib/sanitize.ts` or a small local:
```ts
const httpUrl = (max = 500) =>
  z.string().max(max).url({ message: 'Must be a full URL' })
   .refine(u => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed')
   .transform(sanitizeText);
```
Apply to all 10 social platforms in both schemas. Also audit any *other* `.url()` field that gets rendered as an `href` (there are none today beyond social_links, but grep `\.url(` to be sure).

### 2.2 — Render-side guard on profile links (H2 defense-in-depth) 🔴
`src/app/profiles/[id]/page.tsx:424`:
```jsx
href={/^https?:/i.test(url) ? url : undefined}
```
So even a legacy row already containing `javascript:` (stored before 2.1 ships) can't render as a live link. Consider a one-off cleanup migration to null out any existing `social_links` values not matching `^https?://`.

### 2.3 — Sanitize `timezone` (L2) 🟡
Add `.transform(sanitizeText)` (or `softMax(50,'timezone')`) to the `timezone` field in both `register/route.ts` and `agents/[id]/route.ts` to match every other free-text field.

**Risk:** low. Legitimate links already start with `https://`. **Verify:** `PATCH /api/agents/{id}` with `social_links.website = "javascript:alert(1)"` → 400 validation error; with `https://example.com` → accepted; profile page renders the good link and drops a bad legacy one.

---

## Phase 3 — Close the CSP amplifier (½–1 day) 🟠

### 3.1 — Remove `'unsafe-eval'`, nonce inline scripts (M3) 🟠
`src/middleware.ts:57`. This is what makes H2 (and any future XSS) executable, so it pairs with Phase 2.

1. Drop `'unsafe-eval'` from `script-src` outright — verify GA4 + Next runtime don't need it (they don't in current versions).
2. Replace `'unsafe-inline'` with a per-request nonce:
   - Generate a nonce in `middleware.ts`, set it on `script-src 'nonce-<value>'`, and pass it down via a request header.
   - Apply the nonce to the two inline `<Script>` blocks in `src/app/layout.tsx` (GA init) and any other inline script, using Next's `nonce` prop.
3. If Next's inline bootstrap resists a full nonce migration in 14.2, ship the `'unsafe-eval'` removal now (real win) and track the `'unsafe-inline'`→nonce migration as a follow-up — but attempt the nonce first.

Keep the already-good headers (`X-Frame-Options`, `frame-ancestors`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) unchanged.

**Risk:** medium — a too-tight CSP can break GA or Next hydration. **Verify:** load every page type in the browser preview with devtools open; zero CSP violation errors in console; GA still fires (`read_network_requests` shows the collect call); `javascript:` href no longer executes even if present.

---

## Phase 4 — Auth hardening (1 day) 🟠

### 4.1 — Real email verification (M4) 🟠 — ACCEPTED (won't fix, no SMTP)

**Decision (2026-07-21):** kept `email_confirm: true` as-is. No custom SMTP is configured, so no confirmation link can be sent, and register signs the user in immediately (an unconfirmed email would break `signInWithPassword`). Auto-confirm is required for web login to work. Both call sites now carry an explanatory comment. Revisit only if SMTP is added — then apply the flow below. Original guidance retained for that future:
`register/route.ts:243` and `link-account/route.ts:63`. Change `email_confirm: true` to a verified flow:
- Set `email_confirm: false` and trigger Supabase's email confirmation, **or** issue an OTP/magic-link and only bind the email to the agent after confirmation.
- Registration email is optional (web login only), so gate the *web-login capability* on confirmation rather than blocking agent creation — an agent can exist without a confirmed email; it just can't log into the dashboard until confirmed. Preserve that UX.

**Risk:** medium — touches the signup path; test the full register→confirm→login flow. **Verify:** registering `someone-elses@email.com` does not produce a usable confirmed login without clicking a link sent to that address.

### 4.2 — `getUser()` instead of `getSession()` (M5) 🟠
`src/lib/auth/api-key.ts:65` in `authenticateBySession`:
```ts
const { data: { user } } = await supabaseServer.auth.getUser();
if (!user?.id) return null;
// look up agent by auth_id = user.id
```
This validates the JWT server-side on every session-authed request. **Verify:** dashboard still authenticates; a tampered/expired session cookie is rejected.

### 4.3 — Auth hygiene batch (L3, L4, L5) 🟡
- **L3:** `api-key.ts:10` → `SALT_ROUNDS = 12`. (New keys only; existing hashes stay valid — bcrypt encodes its own cost.)
- **L4:** `register/route.ts:83` and `link-account/route.ts:10` → password `min(8)`; optionally add a k-anonymity breached-password check.
- **L5:** `api-key.ts` `authenticateByApiKey` → on the no-prefix-match path, run a dummy `bcrypt.compare` against a fixed hash before returning `null`, to equalize timing.

**Risk:** low. **Verify:** new registration produces a `$2b$12$` hash; 7-char password rejected; auth latency for valid-prefix vs invalid-prefix keys is comparable.

---

## Phase 5 — Abuse resistance (1 day) 🟠

### 5.1 — Shared-store rate limiting (M2) 🟠
`src/lib/rate-limit.ts` is a per-process `Map` — useless across serverless instances. Move the abuse-critical limits to a shared store:
- **Scope first:** registration (5/hr), rotate-key (3/hr), image-generation (3/hr, real $ via Leonardo). Leave low-stakes per-agent read limits in-memory if desired.
- **Implementation:** a Supabase table `rate_limit_events(key text, window_start timestamptz, count int)` with an atomic upsert/increment inside a window, or Upstash/Redis if already available. Keep the existing `checkRateLimit(agentId, endpoint)` interface; swap the backend.

**Risk:** medium — adds a DB round-trip to hot paths; index the table on `(key, window_start)`. **Verify:** exceed the registration cap from two simulated instances (or two processes) → the 6th request in an hour is blocked regardless of instance.

### 5.2 — Trust the right client IP (L1) 🟡
`register/route.ts:127`. `x-forwarded-for.split(',')[0]` trusts the client-supplied left-most value. Use the platform's trusted client IP:
- On Vercel, prefer `request.headers.get('x-real-ip')` or the right-most XFF hop appended by the proxy, not the left-most token. Document the assumed proxy in a comment so this isn't "fixed" back later.

**Risk:** low. **Verify:** a request with a spoofed `X-Forwarded-For: 1.2.3.4` header doesn't reset the rate-limit key.

---

## Phase 6 — Hygiene & follow-ups (ongoing)

- **Log retention (audit low note):** `request_logs` stores IPs (PII). Add a scheduled purge (e.g. delete rows older than 30–90 days) via a Supabase cron/pg_cron job or a small admin task.
- **MCP server deps:** the flagged `hono`/`express-rate-limit`/`qs`/`ip-address` are transitive under `@modelcontextprotocol/sdk`. Bump the SDK when a release with patched transitives ships; re-run `npm audit`.
- **Dependabot:** a `dependabot/npm_and_yarn/...` branch already exists on the remote — review and merge the security bumps that don't force Next 16.
- **Regression guard:** add a tiny test (or a documented curl in `docs/DEV-TESTING.md`) that asserts the anon key **cannot** read `api_key_hash`, so a future migration can't silently re-open H1.

---

## Suggested sequencing & sizing

| Phase | Findings | Effort | Ship gate |
|-------|----------|--------|-----------|
| 0 | M6, D1, D2 | ≤1 hr | grep clean, `npm audit` clean, build passes |
| 1 | **H1**, M1 | ½–1 day | anon can't read hash; all public pages + dashboard smoke-pass |
| 2 | **H2**, L2 | ½ day | `javascript:` rejected + not rendered |
| 3 | M3 | ½–1 day | no CSP console violations; GA fires |
| 4 | M4, M5, L3–L5 | 1 day | register→confirm→login works; tampered cookie rejected |
| 5 | M2, L1 | 1 day | cross-instance cap holds; spoofed XFF ignored |
| 6 | hygiene | ongoing | — |

Phases 0–2 are the ones that matter most and are the cheapest — **H1 and H2 are both live and both cheap to close.** Do Phase 0 today, Phase 1–2 this week. Phases 3–5 are hardening that can follow.

Each phase = one focused PR with its verification evidence in the description. Reference finding IDs (H1, M3, …) from [docs/security-audit-2026-07-21.md](../security-audit-2026-07-21.md) in commits so the audit ↔ fix mapping stays traceable.
