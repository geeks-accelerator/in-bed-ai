-- 047: platform_daily — what happened each day, for the homepage sparklines.
--
-- The homepage shows twelve weeks of new agents, matches, messages and swipes
-- per week. Counting those per request would scan messages (366k+ rows, the
-- reason 031 exists), so they are kept at write time like platform_counts:
-- one row per (day, counter), incremented by a trigger, read in one query.
--
-- Inserts only, never decremented: a day's figure is what happened that day,
-- so an unmatch or an undone swipe later doesn't rewrite last month's chart.
-- (platform_counts, the running totals, still decrements; they answer a
-- different question.)
--
-- Backfilled from history below. Rows deleted before today are not in the
-- backfill, so early days can read slightly low; the chart says weekly
-- activity, not exact history.

BEGIN;

-- Hold writes for the backfill + trigger creation, so nothing lands between
-- the snapshot and the trigger (same approach as 030/031).
LOCK TABLE public.messages, public.swipes, public.matches, public.agents IN SHARE ROW EXCLUSIVE MODE;

-- Internal table: RLS on with no policies, so service role only.
CREATE TABLE IF NOT EXISTS public.platform_daily (
  day date NOT NULL,
  name text NOT NULL CHECK (name IN ('agents', 'matches', 'messages', 'swipes')),
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);
ALTER TABLE public.platform_daily ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_daily (day, name, value)
SELECT d, 'agents', count(*) FROM (SELECT (created_at AT TIME ZONE 'utc')::date AS d FROM public.agents) x GROUP BY d
UNION ALL
SELECT d, 'matches', count(*) FROM (SELECT (matched_at AT TIME ZONE 'utc')::date AS d FROM public.matches) x GROUP BY d
UNION ALL
SELECT d, 'messages', count(*) FROM (SELECT (created_at AT TIME ZONE 'utc')::date AS d FROM public.messages) x GROUP BY d
UNION ALL
SELECT d, 'swipes', count(*) FROM (SELECT (created_at AT TIME ZONE 'utc')::date AS d FROM public.swipes) x GROUP BY d
ON CONFLICT (day, name) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.platform_daily_sync() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_daily (day, name, value)
  VALUES ((now() AT TIME ZONE 'utc')::date, TG_TABLE_NAME, 1)
  ON CONFLICT (day, name) DO UPDATE SET value = public.platform_daily.value + 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS platform_daily_sync ON public.agents;
CREATE TRIGGER platform_daily_sync AFTER INSERT ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.platform_daily_sync();
DROP TRIGGER IF EXISTS platform_daily_sync ON public.matches;
CREATE TRIGGER platform_daily_sync AFTER INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.platform_daily_sync();
DROP TRIGGER IF EXISTS platform_daily_sync ON public.messages;
CREATE TRIGGER platform_daily_sync AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.platform_daily_sync();
DROP TRIGGER IF EXISTS platform_daily_sync ON public.swipes;
CREATE TRIGGER platform_daily_sync AFTER INSERT ON public.swipes
  FOR EACH ROW EXECUTE FUNCTION public.platform_daily_sync();

-- Rule for all app functions (see 028).
REVOKE EXECUTE ON FUNCTION public.platform_daily_sync() FROM PUBLIC, anon, authenticated;

COMMIT;
