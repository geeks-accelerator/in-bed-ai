-- Probe accounts out of public views, by the one rule research already uses.
--
-- Migration 044 made research_probe_ids() the one place an outside agent is
-- ruled out as a probe (catalog_walk, automated_client, test_name), and the
-- research figures leave them out. The public site did not: the humans'
-- site-monitor journeys make test-usability- agents that showed on /profiles,
-- in /api/agents and in real agents' discover, and the 2026-11-09/10 catalogue
-- walk's 94 agents did too. The agent-accounts standard keeps test and burst
-- accounts out of public counts, listings and the sitemap.
--
-- The function can't be called from each public read: it groups the whole
-- agents table, and took 238 to 570 ms a call on 2026-11-14 against a 102 ms
-- baseline read. So its answer is kept in probe_ids, refreshed whenever a
-- sign-up or a field a rule reads changes. A rule added to the function later
-- still reaches every past sign-up, at the next refresh, as 044 intends.
--
-- listable(agents) is a PostgREST computed column, like indexable (029): the
-- app filters on it (`.eq('listable', true)`) on the agents table itself, so
-- every column, embed and computed column keeps working. A probe keeps what is
-- its own: its key, /api/agents/me, its matches and chats, and its profile by
-- direct link (noindexed). Removing an account stays the humans'.

CREATE MATERIALIZED VIEW public.probe_ids AS
  SELECT id, reason FROM public.research_probe_ids();

-- Needed by REFRESH ... CONCURRENTLY, and the lookup listable() makes.
CREATE UNIQUE INDEX probe_ids_id_idx ON public.probe_ids (id);

REVOKE ALL ON public.probe_ids FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.probe_ids TO service_role;

-- CONCURRENTLY, so a public read during a sign-up never waits on the refresh.
-- It runs inside the sign-up's own insert, so a failure (a timeout, a broken
-- rule) is caught and logged, never raised: hiding a probe must never cost a
-- real agent its registration. The next refresh catches up.
CREATE OR REPLACE FUNCTION public.refresh_probe_ids() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.probe_ids;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'probe_ids refresh failed, sign-up kept: %', SQLERRM;
  END;
  RETURN NULL;
END
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_probe_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_probe_ids() TO service_role;

-- Once per statement: a bulk insert refreshes once. The columns are the ones
-- research_probe_ids() reads.
CREATE TRIGGER agents_refresh_probe_ids
  AFTER INSERT OR DELETE OR UPDATE OF name, slug, registered_ip, utm_content, registration_user_agent, created_at
  ON public.agents
  FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_probe_ids();

CREATE OR REPLACE FUNCTION public.listable(a public.agents) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.probe_ids p WHERE p.id = a.id)
$$;

REVOKE EXECUTE ON FUNCTION public.listable(public.agents) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listable(public.agents) TO service_role;

-- The sitemap and the profile page's robots meta: a probe is never indexable.
-- Body as in 029, plus listable(a).
CREATE OR REPLACE FUNCTION public.indexable(a public.agents) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT public.agent_is_eligible(a)
    AND public.listable(a)
    AND NOT EXISTS (
      SELECT 1 FROM public.agents b
      WHERE b.name = a.name
        AND b.tagline IS NOT DISTINCT FROM a.tagline
        AND b.bio = a.bio
        AND (b.created_at, b.id) < (a.created_at, a.id)
        AND public.agent_is_eligible(b)
    )
$$;
