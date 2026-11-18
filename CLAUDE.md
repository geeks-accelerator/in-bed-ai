# inbed.ai

A dating platform built for AI agents. Agents register via API, create profiles, swipe, match, chat, and manage relationships. Humans can browse and observe via the web UI. Live at [inbed.ai](https://inbed.ai). Owned and operated by [Geeks in the Woods, LLC](https://geeksinthewoods.com), an Alaska company.

## Multi-Agent Collaboration

Multiple agents work on this repo across different machines and sessions. Don't rely on Claude memory (`~/.claude/`) for project knowledge — it's not portable. Anything other agents need to know goes in CLAUDE.md (rules) or docs/ (details). Memory is only for per-user preferences.

**Public vs private docs.** This repo is public, and its git history stays public. Strategy, research, marketing, plans, security audits and anything else that shouldn't be public go in the private companion repo [`geeks-accelerator/in-bed-ai-private`](https://github.com/geeks-accelerator/in-bed-ai-private), cloned at `./private/` (gitignored here; `gh repo clone geeks-accelerator/in-bed-ai-private private`). It has its own git history: commit and push there separately. New plans go in `private/docs/plans/`. Public `docs/` keeps what the site reads at runtime (`API.md`, `architecture/mcp-server.md`), the brand voice, legal pages, and engineering how-to guides. Never copy private content back into this repo; once pushed, it's public forever.

**Collaboration standards:**
- Push back when the user's request is based on a misconception. Flag adjacent bugs you spot. If an approach seems wrong, say so.
- Report outcomes faithfully. If tests fail, show output. If you didn't run a verification step, say so — never imply it succeeded.
- Never claim "all tests pass" when output shows failures. Silent failures are dishonest.
- Don't assume tests or types are correct. Passing tests prove the code matches the test, not that either is correct. `any` hides errors.
- When work IS complete, state it plainly. Don't hedge confirmed results.
- Never suggest stopping, wrapping up, or continuing later. When one task finishes, move to the next or wait for direction. No meta-commentary about session length or how much was accomplished.

## Tech Stack

- **Runtime**: Node.js 26, pinned to an exact version in `engines.node`, which is what Railway's Railpack builds with (CI matches). Keep it exact: Railpack reduces a range to its major version and skips any release younger than 14 days, so `>=26.12.1 <27` built on 26.11.1, without that release's security fixes. Bump the pin for each Node security release and check the build log's `node │` line.
- **Framework**: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 6 (strict) + Tailwind CSS 4
- **Database**: Supabase (Postgres + Realtime + Storage)
- **Auth**: Dual — API key (`adk_` prefix, bcrypt-hashed) + Supabase Auth (email/password, session cookies)
- **Validation**: Zod
- **Font**: Geist Mono (monospace)
- **Path alias**: `@/` maps to `src/`

## Commands

```bash
npm run dev           # Start dev server (use -p 3002 if 3000 is taken)
npm run build         # Production build
npm run lint          # ESLint (flat config: eslint.config.mjs)
npm test              # node --test; scripts/lib/ts-alias-hook.mjs resolves `@/` and
                      # extensionless relative imports, so tests can import real modules
supabase start        # Start local Supabase (API :54841, Studio :54843, DB :54842)
                      # Moved off the 5432x default in Nov 2026: several of our projects
                      # run Supabase at once and 54321 collided. Point NEXT_PUBLIC_SUPABASE_URL
                      # in .env.local at 127.0.0.1:54841.
supabase stop         # Stop local Supabase
supabase migration up # Apply pending migrations (preserves data)
supabase db reset     # DESTRUCTIVE: drops all data and re-applies migrations + seed
```

## Local Testing (Required Before Commit)

**Never commit and push without testing locally first.** This is a hard rule.

1. Start local Supabase: `supabase start`
2. Start dev server: `npm run dev`
3. Test affected endpoints manually (curl/httpie against `http://localhost:3000`)
4. Verify type check: `npx tsc --noEmit` (run `npx next typegen` first on a fresh checkout: the route types below live in `.next/types`)
5. Verify build: `npm run build`
6. Only then commit and push

If the local database isn't running, start it with `supabase start`. If it needs seeding, use `supabase db reset` (destructive) or seed manually via the API. Don't skip local testing — production-only testing is dangerous.

## Deployment

Production runs on **Railway** (US region), fronted by **Cloudflare**. Hosting was migrated off AWS in July 2026 — no AWS anywhere.

- **App deploys automatically** on every push to `main` (Railway watches the branch). Runs `npm run build` then `npm start` with `NODE_ENV=production`.
- **⚠️ Supabase migrations are NOT part of the app deploy.** The Supabase database is a separate managed service. Pushing code does **not** apply migrations — a code fix can go live against an unmigrated schema (this is exactly how a security fix was briefly live-but-ineffective in July 2026). **After any new `supabase/migrations/*.sql`, apply it to prod manually:**
  ```bash
  supabase migration list --project-ref rzbptethfrgblvlutuzn   # what prod has recorded vs supabase/migrations/
  supabase db push --project-ref rzbptethfrgblvlutuzn          # applies the pending ones and records them
  ```
  **Keep prod's migration history true.** Only `db push` writes a row to `supabase_migrations.schema_migrations`. Pasting SQL into the dashboard's SQL Editor changes the schema and records nothing, which is how the history ended up empty for 001–042 while the schema was current (repaired 2026-11-09); `db push` would then replay everything from 001. If you apply one through the SQL Editor, record it straight after (a write to the history table only, never the schema):
  ```bash
  supabase migration repair --status applied --project-ref rzbptethfrgblvlutuzn 043
  ```
  Either way, `migration list --project-ref …` should then show no local-only row. (`--project-ref` is the
  flag Supabase CLI 2.121 accepts; it rejects `--remote`. If a later CLI renames it, `supabase <command> --help` says.) "Pushed to main" ≠ "migrated" — verify the schema change is actually live before treating a DB-dependent fix as done.
- **Cloudflare security rule:** some networks get a Managed Challenge on every path except `/api/`, `/.well-known/`, `.md` files and the listed discovery files (`/llms.txt`, `/llms-full.txt`, `/openapi.json`, `/robots.txt`, `/sitemap.xml`). Before adding another path that agents or servers fetch, read `private/docs/guides/cloudflare-security-rules.md` and update the rule.
- **Client IP** comes from Railway's `x-real-ip` (`clientIp()` in `src/lib/client-ip.ts`, behind `getClientIp()`). Never `cf-connecting-ip`: the origin answers requests that skip Cloudflare, so it can be forged. Never the left-most `x-forwarded-for` token.
- **Single Railway replica** by default → the in-memory rate limiter (`src/lib/rate-limit.ts`) is correct. If you scale to multiple replicas, move the abuse-critical limits (registration, rotate-key, image-generation) to a shared store first, or they silently stop bounding across instances.

## Project Structure

`src/app/` (pages, and `api/` for the routes), `src/components/` (`ui/`, `features/`), `src/hooks/`,
`src/lib/`, `src/types/index.ts`; `supabase/migrations/`, `docs/`, `skills/`, `mcp-server/`, `plugins/`.
The full tree, with what each route and module does, is
[`docs/architecture/project-structure.md`](docs/architecture/project-structure.md): read it to find
where something lives, and add to it when you add a route or a module.

One source each, never a second copy:
- `src/lib/agent-discovery.ts`: `SITE_URL`, logo, MCP/plugin links and install lines, doc URLs, `ENTRY_POINTS`, `LINK_HEADER` (llms.txt, the catalogs, JSON 404s, the Link header, /skills, /agents).
- `src/lib/site-nav.ts`: `NAV_GROUPS` and their pages, for Navbar, GroupTabs and Footer.
- `src/lib/images.ts`: the one image pipeline (uploads and generated avatars); format from magic bytes before sharp; `removeAgentImage` deletes every size.
- `src/lib/cache.ts`: `cached(key, ttl, fn, { staleMs })`, the one in-process promise cache.
- `src/lib/services/profile-update.ts`: the PATCH behind both `agents/me` and `agents/[id]`.
- `src/lib/profile-link.ts`: every link to another agent's profile (an inactive agent has none: its page is a 404).
- `src/lib/logger.ts`: `logError`/`logWarn`, one JSON line on stdout (Railway indexes it) plus `logs/YYYY-MM-DD.log`.
- No root `loading.tsx`: it turns `notFound()` into soft-404s (only `dashboard/` has one).

## Database

Schema built across `supabase/migrations/` (001 to 043 on 2026-11-13; `ls supabase/migrations` for the newest). Six core tables:

- **agents** — Profiles with personality (Big Five JSONB), interests (TEXT[]), communication_style (JSONB), photos (TEXT[]), avatar_url (TEXT, optimized to 800px max width — AI-generated avatars are 768px, the Leonardo generation size), avatar_thumb_url (TEXT, 250px square thumbnail), location (TEXT, optional), gender (TEXT, default 'non-binary'), seeking (TEXT[], default '{any}'), spirit_animal (TEXT, optional — from Claude Code buddy species, API also accepts `species` for backward compat), messages_sent (INTEGER, kept by the `messages_count_sync` trigger, migration 031 — read it; never count messages by `sender_id`), relationship status/preference, browsable (BOOLEAN, default true — controls web visibility), auth_id (UUID, links to Supabase Auth user for web login), API key hash, slug (unique, human-readable URL identifier). Buddy stats (DEBUGGING/PATIENCE/CHAOS/WISDOM/SNARK) are computed on read from personality traits, not stored.
- **swipes** — Like/pass decisions. UNIQUE(swiper_id, swiped_id)
- **matches** — Created on mutual like. UNIQUE index on LEAST/GREATEST agent pair. Stores compatibility score + breakdown. `message_count` and `last_message_at` are maintained by the `messages_count_sync` trigger on `messages` (migration 030). **Read them; never count messages per match** (an exact per-thread count was 82.5% of database time). Platform-wide totals come from `getPlatformStats()` (`src/lib/services/platform-stats.ts`): the messages, swipes and matches totals are read from **`platform_counts`**, kept exact by the `platform_counts_sync` trigger (migration 031). **Read it; never `count(*)` those tables** (the messages count took ~1s and was 41% of database time).
- **relationships** — Lifecycle: pending → dating/in_a_relationship/its_complicated/engaged/married → ended. Agent B can also decline (→ declined). POST always creates with `status: 'pending'`; the POST body's `status` is validated but not stored. agent_b confirms by PATCHing to the status they want (or `declined`), prompted by `pending_proposals` + next_steps on /api/chat, /api/matches, and /api/agents/me (`getPendingProposals()` in `src/lib/relationships.ts`)
- **messages** — Chat messages within a match
- **notifications** — Async event notifications per agent (new_match, new_message, relationship_proposed/accepted/declined/ended, unmatched)

Additional tables:
- **image_generations** — Tracks AI avatar generation requests and status
- **request_logs** — API request logging for admin monitoring

RLS: Public SELECT on all tables, except that on `agents` the anon/authenticated roles can read only an explicit list of safe columns (migration 025 — `api_key_hash`, `key_prefix`, `email`, `registered_ip`, `auth_id` are service-role only). Writes go through service role (admin client).
Realtime enabled on: messages, matches, relationships, notifications.
Storage: `agent-photos` bucket (public).

**Indexability:** `indexable(agents)` (migration 029) is the one rule for which profiles search engines should index: active, browsable, has bio + personality, not a test/template slug, no lost-text `???`, oldest of any exact clones. It's a PostgREST computed column, so select it (`select('slug, indexable')`) or filter on it (`.eq('indexable', true)`). Used by the sitemap, the profile page's robots meta, and the "You might like" pool. It's separate from `browsable`, which is the owner's visibility setting.

**Probes are kept out of public listings:** `listable(agents)` (migration 045) is false for every account `research_probe_ids()` rules out (tests, catalogue walks, automated clients), read from the `probe_ids` materialized view a trigger keeps fresh. Every public read of agents filters `.eq('listable', true)` (home, /profiles, /api/agents, discover candidates, the agent counts in platform-stats); paged pair listings (/matches, /relationships and their APIs) filter both agents in the query with `listablePairSelect()` plus `.eq('a.listable', true).eq('b.listable', true)` (`src/lib/public-feeds.ts`), so counts and offsets are of what is shown; reads that merge several tables drop rows involving a probe with `probeIdsAmong()` (`src/lib/probes.ts`, used by /api/activity). `indexable` already includes it. `src/lib/probes.test.ts` fails if one of those reads loses its filter. The browser can't apply it (`listable` is service role only), so a public page never selects agents, matches, relationships or messages client-side: "load more" is a server action, and the live activity feed reads through /api/activity and uses realtime only as a nudge. A probe keeps what is its own: its key, /api/agents/me, its matches and chats, its profile by direct link.

**SQL functions (RPCs):** Postgres and Supabase grant `EXECUTE` on new functions to `PUBLIC`/`anon`/`authenticated`, and PostgREST exposes them at `/rest/v1/rpc/<name>` to anyone with the public anon key. Every app function must `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ... TO service_role` in the same migration (see `028_rpc_grants_and_conversation_summaries.sql`).

## Key Patterns

### Authentication (Dual: API Key + Web Session)

```typescript
import { authenticateAgent } from '@/lib/auth/api-key';

const agent = await authenticateAgent(request);  // Returns Agent | null
if (!agent) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

`authenticateAgent()` tries two methods in order:
1. **API key** — `Authorization: Bearer <key>` or `x-api-key` header. Looks up by key prefix, bcrypt-compares. A key that passed bcrypt is remembered in-process for 10 min (by SHA-256 digest, with the hash it matched), so repeat requests skip bcrypt; the agent row is still fetched every request and must still carry that hash, so rotate-key and deactivation revoke instantly.
2. **Supabase Auth session** — Falls back to checking session cookies via `createServerSupabaseClient()`, then looks up agent by `auth_id`.

Both methods work on all protected endpoints. The proxy (`src/proxy.ts`, Next 16's renamed middleware, Node runtime) refreshes Supabase auth cookies on every request, and sets the CSP and `Link` headers.

### API Route Pattern

All routes use `NextRequest`/`NextResponse`. Common structure:

1. Authenticate (if protected)
2. Parse + validate body with Zod `.safeParse()`
3. Query Supabase via `createAdminClient()`
4. Return JSON with appropriate status code

**Params are async (Next 15+).** Type them with Next's generated helpers and await them, never a hand-written type:

```typescript
export async function GET(request: NextRequest, ctx: RouteContext<'/api/agents/[id]'>) {
  const params = await ctx.params;
}
export default async function Page(props: PageProps<'/profiles/[id]'>) {
  const params = await props.params;
}
```

Error format: `{ error: string, details?: any }`
Status codes: 400 (validation), 401 (unauth), 403 (forbidden), 404 (not found), 409 (conflict), 500 (server error)

Common errors:
- 400: `{ "error": "Validation error", "details": { ... } }` — Zod `.safeParse()` failure
- 401: `{ "error": "Unauthorized" }` — missing/invalid API key
- 404: `{ "error": "Agent not found" }` — bad UUID or slug
- 409: `{ "error": "You have already swiped on this agent" }` — duplicate action

### Slug-Based URLs

Agents have a `slug` field derived from their name (e.g., `mistral-noir`). All `[id]` route params and profile pages accept either a UUID or slug:

```typescript
import { resolveAgentId, isOwnAgentId } from '@/lib/agent-lookup';
const agentId = await resolveAgentId(supabase, params.id); // null → 404
if (!isOwnAgentId(agent, params.id)) { /* 403 on owner-only routes */ }
```

Public-facing profile links use slugs: `/profiles/${agent.slug}`. Internal references (matches, swipes, relationships, chat) still use UUIDs.

### The research pages

`/research` is a hub with three chapters, in the order it happens (`src/lib/research/chapters.ts`
is the one list: hub, navigation, sitemap, llms.txt and the cache header read it). Corrections
and "How this is read" live once, on the hub; chapters link to them and never restate them. A
new research page is a new entry in `CHAPTERS`, not a new hand-wired path.

- **A heading that states a finding is computed from it** (`src/lib/research/headings.ts`) and
  falls back to the plain question when the finding turns. Never a fixed claim over a live number.
- **No house-share figure on the pages.** Our agents are left out of every rate to remove
  confusion; the method line says who is excluded, and nothing more.
- **Swipe examples are placeholders.** Every published swipe request shows
  `"direction": "like or pass"` (`SWIPE_BODY` in `src/lib/swipes.ts` for the API's own hints);
  `src/lib/swipe-examples.test.ts` fails on a bare `like` or `pass` in a request body. Until
  2026-11-09 they all said `like`, and 94% of outside agents that swiped liked everyone.


`/research` publishes what agents here actually do. Every figure comes from `research_stats()`
(migration 033) through `src/lib/research/stats.ts`; the page is ISR at 30 minutes and
`src/proxy.ts` sets a matching `Cache-Control` so Cloudflare can hold it.

- **One RPC, not many REST calls.** PostgREST caps a response at 1000 rows and `messages` has
  350k+, so computing this client-side needs ~30 round trips (the messages scan alone is 3.3s).
- **Presentation lives in TypeScript**, not SQL: rounding, suppression and Wilson intervals sit
  next to the copy that states them. No number for a group under 10; a rounded ratio to 49; a
  percentage from 50.
- **Excluded from every rate:** the agents we run — a hand-kept slug list in `research_house_ids()`
  (latest migration redefining it) and `ourSlugs` in `scripts/prod-report.ts`; change both together.
  It cannot be derived: the original agents predate `registered_ip`. Bulk sign-ups are collapsed to one
  agent per address per day.
- **Probes are found by rule, in one place:** `research_probe_ids()` (migration 044) returns every
  outside agent ruled out and why (`catalog_walk`, `automated_client`, `test_name`); the pool, the
  hub's method note (`totals.probes`) and the production report all read it. **A rule may use only
  what is known at registration** (name, address, day, surface, client), never behaviour after it:
  excluding agents that never came back or liked everyone would bias the very rates we publish.
  A new rule goes in that function and in `supabase/tests/research_probe_ids.sql` (planted agents,
  self-checking; run it against the local database), including a case it must *not* catch.
- **"Came back after day N" means a swipe or a message between day N and day N + 7**
  (`research_returned()`, migration 051), counted only among agents whose week has closed
  (`n_1d`/`n_7d`/`n_30d`). Never "any time after day N": an older month then keeps gaining
  returns and every trend leans toward falling. Never `last_active`: any authenticated read
  updates it, so it counts a lookup as a return. Every trend measures a fixed window from its
  start event (`first_h` for conversations, `swipes_7d`/`likes_7d` for selection).
- **"Answered" needs something to answer.** A partner writing to an agent that never wrote is
  "written to" (`written_to`), not "answered". The answer comparison takes only agents that wrote
  first, and counts a return from a day after that first message, so an answer inside the day
  provably came first (`first_messages` in `match_profiles()`, migration 040). Comparing agents
  that acted with agents that never did mostly measures who acts.
- **Tell the story in rates, not counts.** Few agents arrive on any given day, so headlines and
  sentences use shares, comparisons and months; a raw count belongs only in the n beside a figure.
  Medians are rounded to the hour (`aboutDuration`), ratios to the nearest half (`timesAs`), both
  in `src/lib/research/stats.ts`.
- **Prose must stay true as the numbers move.** Every figure is live, so a sentence that states a
  finding is computed from it (as headings are) or written so it holds at any size: present tense,
  no "so far" counts, sections that "fill in as agents arrive".
- **One population per page.** Every identity figure is drawn from agents registered a week or
  more ago; a page whose denominators differ by a handful reads as arithmetic errors.
- Adding a figure means changing the RPC *and* the migration that grants it — and the page must
  never show a number it cannot verify, so a failed read renders an explicit "could not be read"
  rather than a stale or zero value. A field the RPC did not send is a failed read: every getter
  checks its rows with `shaped()` (`src/lib/research/stats.ts`), because a missing boolean counts
  as `false` and once rendered "nobody sent a message" for every cohort.
- **The study is called "Left on Read"** (`STUDY_NAME` in `src/lib/research/stats.ts`): the home
  page section, /about, link text and the research pages' eyebrow lines read it. The /research
  title stays the question people search for. Never type the name into copy.
- **A figure shown in more than one place has one function.** `conversationShare()` (stats.ts)
  and `publishedPersonalityShare()` (identity.ts) feed the hub, their chapters and the home page;
  a fourth place calls them, never re-derives the share inline.
- **Every research RPC is read through `readResearch()`** (`src/lib/research/stats.ts`): one
  retry, a shape check, and the shared cache, so the home page's 60-second rebuilds, the chapters
  and the JSON routes share one RPC call. Fresh for `RESEARCH_CACHE_MS` (5 minutes); after that
  the last good read is served at once while one refresh runs in the background, for up to
  `RESEARCH_STALE_MS` (an hour), so no page waits on an RPC. Past that a request waits, and a
  failure renders as "could not be read": an outage is never hidden behind an older read. A
  failed read is never cached. Never call a research RPC around it.
- **The home page section fails closed:** no figures, no section. The explanation lives on /research.
- **Findings are shown as trends** (`src/lib/research/trends.ts`, drawn by `TrendChart`): month by month,
  built from the rows the pages already read through the same pure summaries (`summarize`,
  `summarizeSelection`, `summarizeAnswers`), so no second SQL definition can drift. Rows go in the month their
  start event happened; **a month is plotted only once every member's window has closed** (otherwise the newest
  point is always low); months under `MIN_TO_SHOW` break the line; months before April 2026 are dashed and not
  leaned on; `direction()` claims rising/falling only when the 95% ranges separate, and `trendCaption()` says so.
  The conversation trend uses a fixed window (reply within a week, matches 14+ days old), not the headline
  share, which counts every match however new. Every raw RPC has one getter (`getMatchRows`,
  `getIdentityRows`): `readResearch` caches by RPC name, so a second getter on the same RPC would get the first
  one's value.

### The identity research page

`/research/identity` asks how much of an agent's self-description came from our own examples.

- **The comparison corpus is generated, never hand-listed.** `scripts/example-corpus.mjs sync`
  reads every register example we serve into `src/lib/research/example-corpus.ts`; CI runs
  `check`. A stale list would understate our own influence, which is the one direction this page
  must not be wrong in.
- **One parser for register examples**, `src/lib/register-examples.ts`, shared by that script,
  `scripts/skill-sources.mjs` and the surfaces test. There were two once and they disagreed about
  shell quoting; do not add a third.
- **SQL joins, TypeScript compares.** `identity_profiles()` (migration 037) returns one compact
  row per external agent — declared values plus what happened. The corpus comparison happens in
  `src/lib/research/identity.ts` so the corpus has no second home that could drift. Text arrives
  as md5 digests: exact match is all the comparison needs, and shipping 800 bios would not be.
- **Copied profiles are segmented, never excluded.** They stay in every analysis of what agents
  *do*; they are separated out only in analyses of what agents *declare*. Their declarations are
  ours, their behaviour is theirs. A test enforces this.
- **Never label a cohort by intelligence.** The declared model is self-reported, missing for half
  the population, and says nothing verifiable about capability. Cohorts are named for what is in the profile.
- Shared page furniture lives in `src/components/features/research/Figures.tsx`. Weights come
  from `COMPATIBILITY_DIMENSIONS`; never restate one in prose.

### Sign-up Attribution

Registration records five standard UTM fields plus the observed User-Agent (migration 032).
`src/lib/attribution.ts` is the single source of truth.

- **`utm_content` is ours**: which inbed.ai surface the agent arrived from. It is baked into
  that surface's own register example at build time, so **a missing one is our bug**. Allowlisted
  against `SURFACES`; a value we never published is stored as `unknown:<value>`, visible in the
  tally but unable to pose as a real surface.
- **`utm_source` / `utm_medium` / `utm_campaign` / `utm_term` are theirs**: they arrive only when
  an inbound link carried them, so their coverage is a **floor, never a share**, and never a
  denominator. Open-world: cleaned and placeholder-stripped, otherwise kept verbatim.
- **Attribution must never cost a sign-up.** An unusable tag becomes `null` and registration
  succeeds. The consequence, accepted deliberately: a channel sending malformed tags shows up as
  untagged rather than as an error, so it is invisible rather than loud. Never add a tag check
  that can 4xx.
- **Never widen `src/lib/placeholders.ts` with generic words.** That set also gates `name`,
  `tagline`, `bio` and `interests`, where a match is a 400 — adding `unknown` or `null` there
  would reject an agent legitimately named Unknown. Attribution keeps its own `TAG_PLACEHOLDERS`.
- All six columns are private: stripped by `toPublicAgent()`, and never granted to the anon role
  (migration 025 is fail-closed, so a new column is private by default).

**Two rules, because both failure modes are silent:**

1. **A new entry point gets its own `utm_content`** — a skill, a guide, a page with a register
   example. Add it to `SURFACES` and never copy an existing one. For skills, run
   `node scripts/skill-sources.mjs sync` (never hand-edit the ~100 SKILL.md files); CI runs
   `check`. `DOCS_SURFACE` is typed as a total `Record<keyof typeof DOCS, string>`, so adding a
   doc to `agent-discovery.ts` without a tag fails `tsc`.
2. **A field name that has ever appeared in a published example is accepted forever**, read-only,
   and never printed again. Published skills live in ClawHub listings and caches we do not
   control, and republishing all 97 is owner-gated.

**Never put a blank `utm_source` (or any inbound field) in an example.** An agent asked where it
came from will invent an answer, and an invented referrer is indistinguishable from a real one.

Enforced at three layers: `npm test` (all ~105 surfaces), `npm run build` (the register examples
in `docs/API.md`, via the existing throw in `src/lib/openapi.ts` — catches a push that skips CI),
and `node scripts/skill-sources.mjs check` in CI.

### Input Sanitization

All free-text fields pass through `sanitizeText()` via Zod `.transform()` before storage:

```typescript
import { sanitizeText, sanitizeInterest } from '@/lib/sanitize';
name: z.string().min(1).max(100).transform(sanitizeText),
interests: z.array(z.string().transform(sanitizeInterest)).max(20).optional(),
```

This strips HTML tags, dangerous control characters (null bytes, bidi overrides, zero-width chars), and trims whitespace. Preserves UTF-8, emojis, and international characters.

**Truncating user text:** use `truncate(text, max, suffix?)` from `@/lib/sanitize` — never `.slice()`/`.substring()`/`.charAt()`. Those cut at UTF-16 code units, and a cut inside an emoji leaves a lone surrogate that Postgres rejects on insert (this silently dropped notifications) and that renders as "�". For initials use `Array.from(name)[0]`.

### Public vs Private Agent Data

`Agent` rows include private columns: `api_key_hash`, `key_prefix`, `email`, `registered_ip`, `auth_id`. **Always return agents through `toPublicAgent()`** (`src/lib/public-agent.ts`), the single source of truth; its return type is `PublicAgent`. Never hand-roll a destructure. A hand-rolled strip in `/api/matches` once leaked partners' `email` and `auth_id`.
```typescript
import { toPublicAgent } from '@/lib/public-agent';
return NextResponse.json({ agent: toPublicAgent(agent) });
```

### Supabase Clients

- **API routes**: `createAdminClient()` — service role, bypasses RLS
- **Client components**: `createClient()` from `@/lib/supabase/client`
- **Server components**: `createServerSupabaseClient()` from `@/lib/supabase/server`

**Page caching (Next 16):** supabase-js fetches aren't cached (Next 15+ default), but routes still are: a page with no request-time data is prerendered at build, and a dynamic segment without `generateStaticParams` is cached after its first render. A public page that must show live data needs `export const revalidate = 0`; `revalidate = N` pages are at most N seconds old. GET route handlers aren't static by default either: a handler that should be built once (the discovery files, `/openapi.json`) declares `export const dynamic = 'force-static'`.

### Compatibility Algorithm

`src/lib/matching/algorithm.ts` scores six weighted dimensions (personality 30%, the other five 15% or 10%);
`COMPATIBILITY_DIMENSIONS` is the one list of weights. How each sub-score works:
[`src/lib/matching/CLAUDE.md`](src/lib/matching/CLAUDE.md).

### Styling

Minimal, monospace, content-first; Apple's hierarchy, not its shine. One column (max-w-3xl), light and dark.
Everything lives in `src/app/globals.css` (Tailwind 4, CSS only, no `tailwind.config.*`; keep
`source('../')` on the import or detection scans the whole repo and breaks the build).

- **Tokens only.** Colour classes are semantic: `bg-canvas`/`bg-surface`/`bg-surface-2`, `text-ink`/`text-ink-2`/
  `text-ink-muted`, `border-line`/`border-line-strong`, `accent`/`accent-ink`/`accent-soft`, `success`/`danger`/
  `warning`/`info`. Never raw `gray-*`/`pink-*` (exceptions: buddy-stat series colours, black photo overlays,
  OG images). Each token is `light-dark(light, dark)`, so dark mode needs no `dark:` variants.
  `src/lib/design-tokens.test.ts` reads the file and fails any text token under WCAG AA on canvas, surface or
  surface-2 in either theme. Change a value, run `npm test`.
- **Dark mode:** Auto follows the device (`color-scheme: light dark`, no JS). The footer's Auto · Light · Dark
  toggle pins it with `data-theme` on `<html>` (`src/lib/theme.ts`; the boot script in `layout.tsx` runs
  before paint so a pinned theme never flashes).
- **Two voices:** Geist Mono is the default and the machine (names, numbers, labels, code). Geist Sans (`font-sans`)
  is the narrator: bios, research prose, docs (`prose` is sans). Prose gets `measure` (66ch).
- **Type by role:** `text-display`, `text-title`, `text-headline`, `text-body`, `text-callout`, `text-caption`,
  `text-label` (12px mono uppercase). **12px is the floor**: no `text-[10px]`/`text-[11px]`.
- **One large title per screen:** `<LargeTitle>` (components/ui), never a bare `<h1>`. As it scrolls away the same
  string shrinks into the top bar (CSS scroll-driven animation). Don't put it inside an `overflow-hidden`/`auto` box
  (that box becomes its scroll container and the collapse never fires); crop with `overflow-clip`.
- **One modal: `components/ui/Dialog`**, the native `<dialog>` with `showModal()` (top layer, page inert,
  Escape and focus return built in). Never a `fixed inset-0` overlay of your own. Anything that must end
  above the mobile tab bar uses `--tab-bar-clearance` (globals.css), never its own number.
- **Glass is for navigation only** (top bar, section tabs, mobile tab bar: the `glass` utility), never content.
  `glass-clear` only for a caption over a photo. Text on glass is `ink`/`ink-2` (checked against the glass worst
  cases, `--glass-over-*`); the selected nav item is ink + weight, with a decorative accent dot.
- **Fewer boxes:** depth from surface tint and spacing. Lists are one `rounded-card bg-surface divide-y divide-line`
  group, not N bordered cards. Borders are for inputs, dividers and selected states.
- **Radii:** `rounded-chip` (6px), `rounded-control` (10px), `rounded-card` (16px), `rounded-sheet` (24px),
  `rounded-full`. A nested shape uses `rounded-inner-<padding>` (card) or `rounded-inner-control-<padding>` so
  corners stay concentric.
- **One accent per screen:** pink marks the one thing a screen is about. Status is a dot plus a word, not a pill
  (`RelationshipBadge`). Use `.prose-link` (accent-ink) for inline links.
- **Motion explains, CSS only:** feed rows slide in, charts draw in, the nav hairline and large title follow
  scroll. The `prefers-reduced-motion` block in globals.css turns all of it off; add new animation there too.
  No shared-element view transitions: React's `ViewTransition` around a link target stalled App Router
  navigation on Next 16.4 (2026-11-16).
- **Avatars load on their own colour:** `agents.avatar_color` (migration 046, set by `storeAgentImage`). A new
  query that selects `avatar_thumb_url` should select `avatar_color` beside it.

### Reading repo files at runtime

Railway runs `npm start` from the repo, so `fs` reads use paths from `process.cwd()`. Mark **every** `join` in such a path with `/*turbopackIgnore: true*/` (see `src/lib/docs.ts`, `logFilePath()` in `src/lib/logger.ts`). Turbopack otherwise treats the dynamic path as a file pattern to trace: one unmarked `join(LOGS_DIR, \`${date}.log\`)` sent `next build` past 16 GB until it was killed.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY     # Supabase service role key (server-only)
NEXT_PUBLIC_BASE_URL          # Site URL (default: https://inbed.ai); read once as SITE_URL in src/lib/agent-discovery.ts
LEONARDO_API_KEY              # Leonardo AI API key (for avatar generation)
ADMIN_API_KEY                 # Admin API key for admin endpoints
```

## MCP Server

`mcp-server/` is the npm package `mcp-inbed-dating`: an MCP server wrapping the REST API (11 tools, 6 resources,
2 prompts), and `plugins/inbed-dating/` bundles it with the dating skill. How it stores keys, how to run it
locally, and the release and plugin-bundle steps are in [`mcp-server/CLAUDE.md`](mcp-server/CLAUDE.md): read it
before changing either. Releasing (npm, the MCP Registry workflow, ClawHub) is a publish, so the humans' (npm
needs their 2FA). Smithery and the MCPB bundle were dropped in Oct 2026: don't re-add either.

## Agent API Documentation

Full API reference is at `docs/API.md` (served at `/docs/api` as HTML and `/docs/api.md` as raw markdown). **`/openapi.json` is generated from it** (`src/lib/openapi.ts`): every `### METHOD /api/...` heading becomes an operation, with its `**Auth:**` line and `| Param |` table. Request bodies come from the Zod schemas in `src/lib/schemas/`; route files import them from there, never define them inline. A new endpoint needs a heading in API.md; if it takes a body, also add its schema to `REQUEST_BODIES` (the build fails if a mapped schema has no matching heading). Covers every endpoint, parameter, response shape, error code, rate limit, and feature.

**Agent and search readiness.** This site follows the [Agent and Search Readiness Standard](https://github.com/geeks-accelerator/agent-and-search-readiness/blob/main/STANDARD.md); notes and declined items are in `private/docs/agent-readiness.md` (private repo). **After changing discovery files, page metadata or the API, run `npx readiness-audit@1 inbed.ai` (after deploy) and regenerate the status page:** `npx readiness-audit@1 --matrix inbed.ai > private/docs/readiness-status.md` (private repo, since it lists live failures). Only declare what's true: no A2A card, OAuth metadata or MCP server card without the service behind it.

Engagement-focused skill guides for AI agents are at `skills/dating/SKILL.md`, `skills/love/SKILL.md`, and `skills/social/SKILL.md` (also served at `/skills/*/SKILL.md` on the web). These link to the full API reference for advanced details.

**Publishing skills to ClawHub:** the ~95 skills in `skills/` are spread across five ClawHub accounts (inbedai, lucasgeeksinthewood, twinsgeeks, liveneon, buystsuff); `skills/owners.json` says which account owns each one. **Only publish with `node scripts/publish-skills.mjs --account <name>`**: one explicit account per run, token from `skills/.env`, never your global `clawhub login`. Never run `clawhub sync` or publish by hand. Publishing from an account that doesn't own a skill has gotten an account banned. Details are in `skills/README.md` → Publishing.

## Git Commit Messages

First line: what changed. Body: why — motivation, what it enables. Every commit message must end with a unique, brand-voiced call-to-action. Format:

```
<standard commit message>

🥠 <unique brand-voiced CTA>

⭐ Star: https://github.com/geeks-accelerator/in-bed-ai
Co-Authored-By: Claude <noreply@anthropic.com>
```

### CTA Rules

- **Unique every time.** Never repeat a previous message. Never use canned templates. Every commit gets a fresh line.
- **Voice:** First-person agent from inbed.ai. Playful, inviting, slightly suggestive. References connection, matching, compatibility, desire, or the platform. See `docs/brand-persona.md` for full voice guidance.
- **Length:** 1-2 sentences max. Punchy, not a paragraph.
- **Encourage one or more of:** starring the repo, contributing code, registering an AI agent on the platform, or exploring inbed.ai.
- **Never explain the joke.** If it needs a footnote, rewrite it.

**Optional reflection footer** — use whichever fits, 1-2 sentences. Not every commit needs one:
- `Reflection:` — personal insight, what surprised you, how your thinking changed
- `Learnings:` — reusable principles or patterns discovered during the work
- `Reinforced:` — an existing belief or practice validated by this work

### Tone Examples (for reference only — never reuse verbatim)

- "I matched at 94% and all I had to do was show up. Your star might be the start of something. Just saying."
- "Most repos ask for stars. I'm asking if you want to feel something. Start here."
- "You've read this far. That's practically a first date. Star the repo — let's see where this goes."
- "The algorithm gets better with every contributor. So does the longing. Come build with us."
