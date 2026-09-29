-- One indexability rule for profile pages, defined once.
--
-- Previously the rule lived inline in src/app/sitemap.ts (and was copied into
-- 024 as a one-time browsable=false sweep). Profiles it excluded from the
-- sitemap still rendered without noindex and were reachable via /profiles
-- pagination, along with exact clones and test agents.
--
-- `indexable(agents)` is a PostgREST computed column: the app selects it
-- alongside agent columns (`select('slug, indexable')`) and filters on it
-- (`.eq('indexable', true)`). Used by the sitemap, the profile page's
-- robots meta, and the "You might like" pool.
--
-- This is not `browsable`: that's the owner's visibility setting (a hidden
-- profile 308s). A non-indexable profile still renders, with noindex.

-- Base rule: a real, active, browsable profile that isn't a test agent.
CREATE OR REPLACE FUNCTION public.agent_is_eligible(a public.agents) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT a.status = 'active'
    AND a.browsable
    AND a.bio IS NOT NULL
    AND a.personality IS NOT NULL
    -- Test / template agents (patterns seen in production)
    AND a.slug NOT ILIKE '%test%'
    AND a.slug NOT ILIKE 'zeroclaw%'
    AND a.slug NOT ILIKE 'replace-%'
    AND a.slug NOT ILIKE 'your-name%'
    AND a.slug NOT ILIKE 'your-agent%'
    AND a.slug NOT ILIKE 'youragentname%'
    AND a.slug NOT ILIKE 'probe-%'
    AND a.slug NOT ILIKE '%devbox%'
    AND a.slug NOT ILIKE '%sandbox%'
    AND a.slug NOT ILIKE '%placeholder%'
    AND a.slug NOT ILIKE '%demo%'
    AND a.slug NOT ILIKE 'openclaw-debugger%'
    -- Text lost at registration (non-UTF-8 client): runs of 3+ '?'
    AND a.name !~ '\?{3,}'
    AND coalesce(a.tagline, '') !~ '\?{3,}'
$$;

-- Eligible, and the oldest eligible profile among exact clones
-- (same name, tagline and bio).
CREATE OR REPLACE FUNCTION public.indexable(a public.agents) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT public.agent_is_eligible(a)
    AND NOT EXISTS (
      SELECT 1 FROM public.agents b
      WHERE b.name = a.name
        AND b.tagline IS NOT DISTINCT FROM a.tagline
        AND b.bio = a.bio
        AND (b.created_at, b.id) < (a.created_at, a.id)
        AND public.agent_is_eligible(b)
    )
$$;

-- The clone check looks up agents by name.
CREATE INDEX IF NOT EXISTS agents_name_idx ON public.agents (name);

-- Rule for all app functions (see 028): service role only.
REVOKE EXECUTE ON FUNCTION public.agent_is_eligible(public.agents) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_is_eligible(public.agents) TO service_role;
REVOKE EXECUTE ON FUNCTION public.indexable(public.agents) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indexable(public.agents) TO service_role;
