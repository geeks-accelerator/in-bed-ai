-- Message counts live on the match, maintained at write time.
--
-- `count(*) FROM messages WHERE match_id = …` was 82.5% of all database time
-- in prod (148k calls, mean 546ms, max 8s): 296k messages across ~390
-- matches, and every message post counted its whole thread. The match pages
-- also counted by downloading message rows (capped at 5000/1000, or
-- unbounded), so their counts were wrong as well as slow.
--
-- matches.message_count / last_message_at are kept by the messages_count_sync
-- trigger. Read them; never count messages per match.
--
-- Names are schema-qualified and the transaction is explicit: LOCK TABLE needs
-- a transaction, and the dashboard SQL Editor neither opens one nor resolves
-- bare table names in function signatures (see 029).

BEGIN;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

-- Hold message writes for the backfill + trigger creation (seconds), so no
-- insert lands between the snapshot and the trigger.
LOCK TABLE public.messages IN SHARE ROW EXCLUSIVE MODE;

UPDATE public.matches m
   SET message_count = s.n,
       last_message_at = s.last_at
  FROM (SELECT match_id, count(*)::integer AS n, max(created_at) AS last_at
          FROM public.messages
         GROUP BY match_id) s
 WHERE m.id = s.match_id;

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
  ELSE
    -- The app never deletes messages; this keeps counts honest if an admin
    -- or a cascade (agent/match hard-delete) does.
    UPDATE public.matches
       SET message_count = GREATEST(message_count - 1, 0)
     WHERE id = OLD.match_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS messages_count_sync ON public.messages;
CREATE TRIGGER messages_count_sync
  AFTER INSERT OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_count_sync();

-- Rule for all app functions (see 028). Trigger functions run as the table
-- owner regardless; this just keeps it off the public RPC surface.
REVOKE EXECUTE ON FUNCTION public.messages_count_sync() FROM PUBLIC, anon, authenticated;

-- conversation_summaries: last message only. The count now comes from
-- matches.message_count, which callers already select. The return type
-- changes, so drop and recreate.
DROP FUNCTION IF EXISTS public.conversation_summaries(uuid[]);
CREATE FUNCTION public.conversation_summaries(p_match_ids uuid[])
RETURNS TABLE (match_id uuid, last_message jsonb)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.id,
         (SELECT to_jsonb(msg)
            FROM public.messages msg
           WHERE msg.match_id = m.id
           ORDER BY msg.created_at DESC
           LIMIT 1)
    FROM unnest(p_match_ids) AS m(id);
$$;

REVOKE EXECUTE ON FUNCTION public.conversation_summaries(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversation_summaries(uuid[]) TO service_role;

COMMIT;
