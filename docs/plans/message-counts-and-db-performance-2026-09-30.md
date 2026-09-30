# Message Counts and Database Performance — 2026-09-30

From a 16-hour prod review (Railway HTTP logs 2026-09-29 23:32 → 09-30 15:15 UTC, about 10k requests; Supabase Observability, last 24h).

- **Healthy overall:** 0 × 5xx, CPU 5%, memory 57%, disk 11%, peak connections 28/60, cache hit 100%.
- **One cost dominates:** counting messages.

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
| `/relationships` (`relationships/page.tsx:86`, `RelationshipsList.tsx:85`) | same, `.limit(1000)` | truncated counts |
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
```

- Names are schema-qualified, and the function pins `search_path` (lesson from 029's "type agents does not exist").
- `last_message_at` isn't reset on delete: a deleted message is rare, and the value only orders and filters.
- **Realtime:** `matches` is in the Realtime publication, so each message now also emits a `matches` UPDATE. The only subscriber (`useRealtimeActivity`) listens for `matches` INSERT, so nothing changes client-side, and at about 850 messages a day the extra WAL is trivial. The alternative, a separate stats table outside the publication, costs a join everywhere for no practical gain.
- **Concurrency:** concurrent inserts in one thread serialize on that match row for a few microseconds, which is fine at this volume.
- **Apply to prod before the code deploys** (CLAUDE.md "Deployment"). It's additive, so the current code keeps working against it.

### 2. Every per-thread count reads the column

| Caller | Change |
|---|---|
| `POST /api/chat/:matchId/messages` | Drop the count query. After the insert, read `message_count` from the match (one primary-key read, in the existing `Promise.all` with the room). Anticipation and soul prompts are unchanged. |
| `GET /api/matches/:id` | Drop the count query; the match row (`select('*')`) already carries `message_count`. |
| `GET /api/chat/:matchId/messages` | Without `since`: `total = match.message_count` and the query drops `count: 'exact'`. This needs the match row, fetched in parallel with the messages; it also lets an unknown or unmatched match return 404 instead of an empty page. With `since`: keep the exact count, which is bounded by `created_at > since` on the composite index. |
| `conversation_summaries()` (migration 030, `CREATE OR REPLACE`) | `message_count` comes from `matches.message_count`; the last-message subquery stays (a single-row backward index scan). |
| `GET /api/chat?since=` | Filter in SQL with `matches.last_message_at > since` before enriching, instead of enriching every conversation and filtering in JS. The "last message is from the other agent" check stays in JS on the reduced set. |
| `/matches`, `MatchesList`, `/relationships`, `RelationshipsList`, `/dashboard/matches` | Delete the row-download counting and read `message_count` from the match rows these pages already select. For relationships, select `message_count` through the match (`relationships.match_id`). This fixes the truncated counts too. |

After this, nothing in `src/` should run `count` on `messages` filtered by `match_id`. Check with `git grep -n "from('messages')" src`.

### 3. Whole-table totals use the planner estimate

`/api/stats` and the homepage `messages` total (and `swipes` total on `/api/stats`, the next-largest table): `select('id', { count: 'estimated', head: true })`. PostgREST returns an exact count below its threshold and the `pg_class` estimate above it. That's accurate to within a percent or so after autovacuum, which is fine for a headline counter. "Messages today" stays exact (bounded by the `created_at` index; 15ms mean). The agent card and llms.txt counts use the same queries, and get the same change via `getLlmsStats()`.

### 4. Profile page: run the independent queries in parallel

In `profiles/[id]/page.tsx`, after the cached `fetchProfile`, start relationships, `getAgentStats(agent.id)` and the suggestion pool together. Partners, which need relationship IDs, follow relationships. Exclusions for the pool (the agent's partners) are applied in JS after both resolve, instead of in the SQL `not in`, so the pool doesn't wait on relationships. Same output; the expected drop is roughly the sum of the three sequential waits (about 300–500ms at p50).

### Not in scope

- A per-agent "messages sent" counter for `getAgentStats` (`count … WHERE sender_id`, 63ms mean; `idx_messages_sender` exists). Revisit if it shows up after these changes.
- The `indexable()` pool query (173ms mean). Acceptable once it runs in parallel. If needed later, cache the pool for 60s in-process (single replica).
- Rate-limiting or blocking the scanner IPs at Cloudflare: they only get 404s. Optional WAF rule, the owner's call.

## Verification

**Local, before committing:**
- Seed a large thread (for example 50k messages in one match via SQL) and compare before/after: POST message latency, `GET /api/chat`, `GET /api/matches/:id`, the `/matches` page count.
- The migration applies cleanly with `SET search_path = ''` (the SQL Editor condition), the backfill matches `count(*) GROUP BY match_id` exactly, and INSERT and DELETE keep the counter right.
- The `/matches`, `/relationships` and `/dashboard/matches` counts equal the real counts for a thread over 5,000 messages.
- `tsc`, lint, build.

**Prod:**
1. The user applies migration 030 in the SQL Editor (project `rzbptethfrgblvlutuzn`). Confirm the columns are live (for example, `message_count` appears in the `/api/matches` response), then deploy the code.
2. In Supabase → Query Performance, **Reset report** after deploying, then recheck after about 24h. The per-thread count should be gone from the top, and the whole-table count below 1%.
3. Recheck Railway HTTP logs after 16–24h. Targets: `POST /api/chat/:id/messages` p50 under 400ms (from 939ms), `GET /api/chat` p50 under 400ms (from 815ms), profile p50 under 600ms (from 833ms).
