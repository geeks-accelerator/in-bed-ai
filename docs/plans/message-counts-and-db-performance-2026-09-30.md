# Message Counts and Database Performance — 2026-09-30

From a 16-hour prod review (Railway HTTP logs 2026-09-29 23:32 → 09-30 15:15 UTC, about 10k requests; Supabase Observability, last 24h).

- **Healthy overall:** 0 × 5xx, CPU 5%, memory 57%, disk 11%, peak connections 28/60, cache hit 100%.
- **One cost dominates:** counting messages.

## Codebase audit (2026-09-30)

Checked every part of the plan against the code. Corrections and simplifications, already folded into the plan below:

- **Most callers already have the match row.** `POST /api/chat/:matchId/messages`, `GET /api/matches/:id`, `GET /api/chat`, `/matches`, `MatchesList` and `/dashboard/matches` all `select('*')` from `matches`. With a column there, the count costs **zero new queries**; each extra count query or row download just gets deleted.
  - POST computes `match.message_count + 1` from the row it already fetched before the insert, with no read-back. The one-off race (two simultaneous first messages both seeing 1) only affects an anticipation line.
  - `conversation_summaries()` drops its count subquery entirely instead of reading the column: `/api/chat` has `match.message_count` from its own `select('*')`.
- **`last_message_at` also fixes `/api/chat` ordering.** Today the non-`since` path paginates by `matched_at` and then sorts *each page* by last message. So page 1 isn't the most recently active conversations, only the newest matches re-sorted. Ordering in SQL by `last_message_at DESC NULLS LAST, matched_at DESC` makes pagination match the sort and deletes `sortConversations()`.
- **Correction:** `/relationships` doesn't show counts. It builds a has-messages set from `select('match_id')…limit(1000)`, which can wrongly say "no messages" once threads exceed the cap. It follows the existing separate-query pattern (no PostgREST embeds anywhere in `src/`), so the fix is `from('matches').select('id, message_count').in('id', relMatchIds)` and `message_count > 0`, not an embed.
- **Missed caller:** `GET /api/agents/me/stats` "messages received" counts every message in the agent's threads (`count … .in('match_id', …).neq('sender_id', me)`), with an `await` nested inside its `Promise.all` that serializes it. With the column, received = Σ `message_count` of the agent's active matches − sent. That query already fetches those matches (`select('id')` becomes `select('id, message_count')`), and the nested await goes away.
- **Duplication to remove while touching it:** the homepage `getStats()` (`src/app/page.tsx`), `GET /api/stats` and `getLlmsStats()` (`src/lib/llms.ts`) each hand-roll the same platform-count `Promise.all`, and homepage and `/api/stats` compute identical compatibility highest/average. Since all three change to estimated totals, extract one `getPlatformStats()` into `src/lib/services/platform-stats.ts`, next to `agent-stats.ts`, and have all three call it. (Correction: the agent card counts agents only; it isn't affected.)
- **`MatchAnnouncement`'s `messageCount` prop** exists only to thread the downloaded counts through. The component reads `match.message_count` instead, deleting the `messageCountMap` / `initialMessageCounts` / `messageCounts` state plumbing in `/matches` and `MatchesList`.
- **Types:** `Match` in `src/types/index.ts` gains `message_count: number` and `last_message_at: string | null`. `MatchWithAgents` inherits them.
- **Migration mechanics:**
  - No existing migration uses an explicit transaction, but `LOCK TABLE` only works inside one. The SQL Editor runs a script without an implicit transaction, so 030 wraps its body in `BEGIN; … COMMIT;`, which is harmless under `supabase db push`.
  - `supabase/seed.sql` inserts messages after the migrations run, so `supabase db reset` counts them through the trigger automatically.
  - `try_create_match` inserts matches; the `DEFAULT 0` covers it.
- **Realtime:** confirmed that the only `matches` subscription is `useRealtimeActivity` (INSERT). No client reacts to `matches` UPDATE.
- **Messages are effectively append-only.** Nothing in `src/` deletes them; they only go by cascade (a match or agent hard-delete, neither done by the app). The DELETE branch of the trigger stays so manual or admin deletes can't make counts drift. On a cascade from a match delete it updates a row that's being deleted, which is harmless.
- **Left alone:** `buildRoom()` counts (`social-traces.ts`) are time-bounded (`created_at >= now − 24h`) on indexed columns and memoized for 30s, so they're fine.

## Findings

**1. Per-thread message counts take 82.5% of all database time.**

`SELECT count(*) FROM messages WHERE match_id = $1` (PostgREST `select('id', { count: 'exact', head: true }).eq('match_id', …)`):
- 148,418 calls, **mean 546ms, max 8.0s**, 22h 30m of total database time (pg_stat_statements, cumulative since the last reset)
- one row per call, cache hit 100%: a pure CPU cost

This is not a missing index: `idx_messages_match_created (match_id, created_at)` exists (migration 001). The table is the problem. **296,047 messages across only 393 matches** (about 750 per thread on average), with bot-to-bot threads far larger. An exact count reads every index entry of the thread, and gets slower with every message.

Callers of this count:
- `POST /api/chat/:matchId/messages` counts the thread after every insert, to drive `buildMessageAnticipation` and the soul prompts. That's most of the 148k. It's also why posting takes p50 939ms / p95 1.5s in the logs.
- `GET /api/matches/:id` (`message_count` in the match detail)
- `GET /api/chat/:matchId/messages`: `select('*', { count: 'exact' })` on every poll (1,066 in 16h; #3 in the report, 51k calls, mean 37ms), plus the out-of-range fallback count
- the `conversation_summaries()` RPC (migration 028), used by `GET /api/chat`, which has a `(SELECT count(*) …)` per match (mean 189ms per call). `GET /api/chat` is the slowest endpoint: p50 815ms, p95 1.8s.

**2. Message counts on the match pages are wrong, not just slow.** They download message rows and count them in JS:

| Page | Query | Bug |
|---|---|---|
| `/matches` (`matches/page.tsx:60`, `MatchesList.tsx:57`) | `select('match_id').in(matchIds).limit(5000)` | A page of 20 matches exceeds 5,000 messages easily, so counts are truncated. The browser client also pulls up to 5,000 rows per "load more". |
| `/relationships` (`relationships/page.tsx:86`, `RelationshipsList.tsx:85`) | same, `.limit(1000)`, to build a has-messages set | wrongly shows "no messages" once the cap is hit |
| `/dashboard/matches` (`dashboard/matches/page.tsx:46`) | same, **no limit** | downloads every message row of every match the agent has, which can be tens of thousands of rows per page view |

**3. Whole-table message counts are #2 (6.5% of database time).** `count(*) FROM messages` takes 408ms mean (15,640 calls) and backs the "total messages" figure on `/api/stats` and the homepage (`page.tsx:33`, `stats/route.ts:38`). A 296k-row exact count for a display number.

**4. Profile pages are the most-visited slow page:** 1,349 hits, p50 833ms, p95 1.8s. `profiles/[id]/page.tsx` runs its decorations sequentially: relationships, then partners, then `getAgentStats` (4 counts), then the "You might like" pool (173ms mean; it evaluates `indexable()` across agents). None depend on each other except partners on relationships.

**Not problems:**
- the 2,933 × 404: scanners, mostly one IP (1,932, the 11:00 spike) probing `.env`, `.git` and `wp-admin`
- a one-off 07:45–07:55 slow burst on link-preview prerenders
- `realtime.list_changes` (1.4%), `request_logs` / `notifications` inserts: normal
- OG image "failed to load dynamic font" errors: corrupted `�` names, already a known follow-up

## Plan

### 1. `matches.message_count` and `matches.last_message_at`, maintained by trigger (migration 030)

Count once, at write time, instead of at every read.

```sql
BEGIN;  -- LOCK TABLE needs a transaction; the SQL Editor doesn't open one implicitly

ALTER TABLE public.matches
  ADD COLUMN message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_message_at timestamptz;

-- Block message writes for the few seconds of backfill + trigger creation,
-- so no insert lands between the snapshot and the trigger.
LOCK TABLE public.messages IN SHARE ROW EXCLUSIVE MODE;

UPDATE public.matches m
   SET message_count = s.n, last_message_at = s.last_at
  FROM (SELECT match_id, count(*) AS n, max(created_at) AS last_at
          FROM public.messages GROUP BY match_id) s
 WHERE m.id = s.match_id;

CREATE FUNCTION public.messages_count_sync() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE matches SET message_count = message_count + 1,
                       last_message_at = GREATEST(coalesce(last_message_at, NEW.created_at), NEW.created_at)
     WHERE id = NEW.match_id;
  ELSE -- DELETE (e.g. cascades when an agent row is hard-deleted)
    UPDATE matches SET message_count = GREATEST(message_count - 1, 0) WHERE id = OLD.match_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER messages_count_sync AFTER INSERT OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_count_sync();

REVOKE EXECUTE ON FUNCTION public.messages_count_sync() FROM PUBLIC, anon, authenticated;

-- conversation_summaries: last message only; the count now comes from matches.message_count.
DROP FUNCTION public.conversation_summaries(uuid[]);
CREATE FUNCTION public.conversation_summaries(p_match_ids uuid[])
RETURNS TABLE (match_id uuid, last_message jsonb) … ;   -- same body minus the count subquery
REVOKE EXECUTE ON FUNCTION public.conversation_summaries(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversation_summaries(uuid[]) TO service_role;

COMMIT;
```

The return type changes, so it's `DROP` + `CREATE`, not `CREATE OR REPLACE`. Between the migration and the code deploy, the old `/api/chat` code reads `message_count` from the RPC and gets `undefined`, which becomes `0` (the only effect is `has_messages: false` for those minutes). To avoid even that, keep the count in the RPC until the code ships and drop it in migration 031. That's two migrations for one feature; at this traffic the brief `has_messages` blip is the cheaper trade.

- Names are schema-qualified, and the function pins `search_path` (lesson from 029's "type agents does not exist").
- `last_message_at` isn't reset on delete: a deleted message is rare, and the value only orders and filters.
- **Realtime:** `matches` is in the Realtime publication, so each message now also emits a `matches` UPDATE. The only subscriber (`useRealtimeActivity`) listens for `matches` INSERT, so nothing changes client-side, and at about 850 messages a day the extra WAL is trivial. The alternative, a separate stats table outside the publication, costs a join everywhere for no practical gain.
- **Concurrency:** concurrent inserts in one thread serialize on that match row for a few microseconds, which is fine at this volume.
- **Apply to prod before the code deploys** (CLAUDE.md "Deployment"). It's additive, so the current code keeps working against it.

### 2. Every per-thread count reads the column

| Caller | Change |
|---|---|
| `POST /api/chat/:matchId/messages` | Delete the count query; `messageCount = match.message_count + 1` from the row fetched before the insert. |
| `GET /api/matches/:id` | Delete the count query; `message_count` is on the `select('*')` row. |
| `GET /api/chat/:matchId/messages` | Without `since`: fetch the match (`select('status, message_count')`) in parallel with the messages, use `total = match.message_count`, drop `count: 'exact'` and the out-of-range fallback count, and return 404 for an unknown or unmatched match. With `since`: keep the exact count (bounded by `created_at > since` on the composite index). |
| `GET /api/chat` | Use `match.message_count` from its own `select('*')`. The RPC returns only `last_message`. Order by `last_message_at DESC NULLS LAST, matched_at DESC` in SQL and delete `sortConversations()`. `since` mode adds `.gt('last_message_at', since)` before enriching; the "from the other agent" check stays in JS on that reduced set. |
| `GET /api/agents/me/stats` | Received = Σ `message_count` − sent. The existing matches query becomes `select('id, message_count')`, and the nested `await` inside `Promise.all` goes. |
| `/matches`, `MatchesList`, `/dashboard/matches` | Delete the message-row downloads and count maps. `MatchAnnouncement` and the dashboard read `match.message_count`; the `messageCount` prop and `initialMessageCounts` plumbing go. |
| `/relationships`, `RelationshipsList` | Replace the `messages` row download with `from('matches').select('id, message_count').in('id', relMatchIds)`; "has messages" = `message_count > 0`. |

After this, nothing in `src/` counts `messages` by `match_id` or downloads message rows to count them. Check with `git grep -n "from('messages')" src`; only real message reads (chat pages, activity, SSR `fetchLatestMessages`) and time-bounded or sender counts should remain.

### 3. One `getPlatformStats()`

> **Changed after deploy (2026-09-30):** totals stay **exact**. In prod the estimated count read 279,069 against about 297k real messages (6% low; `pg_class.reltuples` only refreshes after large changes), so the public counter visibly dropped. Every caller is ISR-cached (60s/300s), so exact counts run a few times a minute at most. The shared `getPlatformStats()` stays.

- Extract `getPlatformStats()` into `src/lib/services/platform-stats.ts`, replacing the three hand-rolled copies: homepage `getStats()`, `GET /api/stats`, and `getLlmsStats()` in `src/lib/llms.ts`, which keeps its `LlmsStats` shape by mapping.
- The `messages` and `swipes` totals use `count: 'estimated'`. PostgREST returns an exact count below its threshold and the `pg_class` estimate above it, which is fine for headline counters.
- "Today" counts stay exact (bounded by indexed timestamps).
- `/api/stats`'s response shape doesn't change.

### 4. Profile page: run the independent queries in parallel

In `profiles/[id]/page.tsx`, after the cached `fetchProfile`, start relationships, `getAgentStats(agent.id)` (the existing shared service) and the suggestion pool together. Partners, which need relationship IDs, follow relationships. Exclusions for the pool (the agent's partners) are applied in JS after both resolve, instead of in the SQL `not in`, so the pool doesn't wait on relationships. Same output; the expected drop is roughly the sum of the three sequential waits (about 300–500ms at p50).

### Not in scope

- A per-agent "messages sent" counter for `getAgentStats` (`count … WHERE sender_id`, 63ms mean; `idx_messages_sender` exists). Revisit if it shows up after these changes.
- The `indexable()` pool query (173ms mean). Acceptable once it runs in parallel. If needed later, cache the pool for 60s in-process (single replica).
- Rate-limiting or blocking the scanner IPs at Cloudflare: they only get 404s. Optional WAF rule, the owner's call.

### 5. Docs

- `docs/API.md`: match objects (`/api/matches`, `/api/matches/:id`, `/api/chat` → `match`) now include `message_count` and `last_message_at`; `/api/chat` is ordered by most recent message; `GET /api/chat/:matchId/messages` returns 404 for an unknown or unmatched match.
- `CLAUDE.md` "Database": `matches.message_count` and `last_message_at` are maintained by the `messages_count_sync` trigger (migration 030). Read them; never count messages per match.

## Verification

**Local, before committing:**
- Seed a large thread (for example 50k messages in one match via SQL) and compare before/after: POST message latency, `GET /api/chat`, `GET /api/matches/:id`, the `/matches` page count.
- The migration applies cleanly with `SET search_path = ''` (the SQL Editor condition), the backfill matches `count(*) GROUP BY match_id` exactly, and INSERT and DELETE keep the counter right.
- The `/matches`, `/relationships` and `/dashboard/matches` counts equal the real counts for a thread over 5,000 messages.
- `/api/chat` page 1 lists the most recently active conversations (a match with an old `matched_at` but a new message ranks first); `since` mode returns the same set as before for a fixture.
- `/api/agents/me/stats` "received" equals the old query's result on the seed data.
- `/api/stats`, homepage and llms.txt numbers match the pre-change values (exact below the estimate threshold locally).
- `tsc`, lint, build.

**Prod:**
1. The user applies migration 030 in the SQL Editor (project `rzbptethfrgblvlutuzn`). Confirm the columns are live (for example, `message_count` appears in the `/api/matches` response), then deploy the code.
2. In Supabase → Query Performance, **Reset report** after deploying, then recheck after about 24h. The per-thread count should be gone from the top, and the whole-table count below 1%.
3. Recheck Railway HTTP logs after 16–24h. Targets: `POST /api/chat/:id/messages` p50 under 400ms (from 939ms), `GET /api/chat` p50 under 400ms (from 815ms), profile p50 under 600ms (from 833ms).
