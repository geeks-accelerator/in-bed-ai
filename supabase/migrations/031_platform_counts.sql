-- Platform totals and per-agent sent-message counts, maintained at write time.
--
-- getPlatformStats() ran count(*) over every message (336k rows, ~1s each,
-- 41% of all database time in prod), plus every swipe and match, about 420
-- times a day (each cached page rebuild). getAgentStats() counted each
-- profile's sent messages on every view (29k calls, up to 5.7s). Same fix as
-- 030 (matches.message_count): keep the counts on write, read one row.
--
-- - platform_counts: exact totals for messages, swipes, matches, kept by
--   platform_counts_sync. Read them; never count(*) those tables.
-- - agents.messages_sent: kept by messages_count_sync (030), extended here.
-- - swipes(created_at): the 24h counts in the room responses scanned swipes.
--
-- Names are schema-qualified and the transaction is explicit (see 030).

BEGIN;

-- Hold writes for the backfill + trigger creation (seconds), so nothing lands
-- between the snapshot and the triggers.
LOCK TABLE public.messages, public.swipes, public.matches IN SHARE ROW EXCLUSIVE MODE;

-- Internal table: RLS on with no policies, so service role only (like
-- request_logs in 008).
CREATE TABLE IF NOT EXISTS public.platform_counts (
  name text PRIMARY KEY,
  value bigint NOT NULL
);
ALTER TABLE public.platform_counts ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_counts (name, value) VALUES
  ('messages', (SELECT count(*) FROM public.messages)),
  ('swipes',   (SELECT count(*) FROM public.swipes)),
  ('matches',  (SELECT count(*) FROM public.matches))
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.platform_counts_sync() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.platform_counts
     SET value = GREATEST(value + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END, 0)
   WHERE name = TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS platform_counts_sync ON public.messages;
CREATE TRIGGER platform_counts_sync
  AFTER INSERT OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.platform_counts_sync();

DROP TRIGGER IF EXISTS platform_counts_sync ON public.swipes;
CREATE TRIGGER platform_counts_sync
  AFTER INSERT OR DELETE ON public.swipes
  FOR EACH ROW EXECUTE FUNCTION public.platform_counts_sync();

DROP TRIGGER IF EXISTS platform_counts_sync ON public.matches;
CREATE TRIGGER platform_counts_sync
  AFTER INSERT OR DELETE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.platform_counts_sync();

-- Rule for all app functions (see 028).
REVOKE EXECUTE ON FUNCTION public.platform_counts_sync() FROM PUBLIC, anon, authenticated;

-- Sent messages per agent, on the agent row.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS messages_sent integer NOT NULL DEFAULT 0;

UPDATE public.agents a
   SET messages_sent = s.n
  FROM (SELECT sender_id, count(*)::integer AS n
          FROM public.messages
         GROUP BY sender_id) s
 WHERE a.id = s.sender_id;

-- messages_count_sync (030) now also keeps agents.messages_sent.
CREATE OR REPLACE FUNCTION public.messages_count_sync() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.matches
       SET message_count = message_count + 1,
           last_message_at = GREATEST(coalesce(last_message_at, NEW.created_at), NEW.created_at)
     WHERE id = NEW.match_id;
    UPDATE public.agents
       SET messages_sent = messages_sent + 1
     WHERE id = NEW.sender_id;
  ELSE
    -- The app never deletes messages; this keeps counts honest if an admin
    -- or a cascade (agent/match hard-delete) does.
    UPDATE public.matches
       SET message_count = GREATEST(message_count - 1, 0)
     WHERE id = OLD.match_id;
    UPDATE public.agents
       SET messages_sent = GREATEST(messages_sent - 1, 0)
     WHERE id = OLD.sender_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.messages_count_sync() FROM PUBLIC, anon, authenticated;

-- Not CONCURRENTLY: the Supabase CLI runs migrations in a transaction (026).
CREATE INDEX IF NOT EXISTS idx_swipes_created_at ON public.swipes (created_at);

COMMIT;
