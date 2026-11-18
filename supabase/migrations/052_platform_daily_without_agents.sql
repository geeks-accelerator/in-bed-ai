-- The homepage's agents sparkline counts only listable agents, like the total
-- beside it.
--
-- 047's trigger counted every agent insert, probes included: whether a new
-- agent is a probe isn't known until probe_ids is refreshed, after the insert.
-- A catalogue walk showed as a spike in the sparkline while the total next to
-- it excluded those agents. getWeeklyActivity() now reads new agents from the
-- agents table filtered by `listable` (a few hundred rows over twelve weeks),
-- so platform_daily keeps only matches, messages and swipes.
--
-- Also: search_path = '' on platform_daily_sync(), whose body is already
-- schema-qualified (048 missed it).

BEGIN;

DROP TRIGGER IF EXISTS platform_daily_sync ON public.agents;
DELETE FROM public.platform_daily WHERE name = 'agents';

ALTER TABLE public.platform_daily DROP CONSTRAINT IF EXISTS platform_daily_name_check;
ALTER TABLE public.platform_daily
  ADD CONSTRAINT platform_daily_name_check CHECK (name IN ('matches', 'messages', 'swipes'));

ALTER FUNCTION public.platform_daily_sync() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.platform_daily_sync() FROM PUBLIC, anon, authenticated;

COMMIT;
