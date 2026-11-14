-- listable(agents) and the probe_ids refresh against planted agents
-- (migration 045). Self-checking: raises on the first wrong answer, and rolls
-- back either way, so nothing is left behind.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54842/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/listable.sql
--
-- The rules themselves are tested in research_probe_ids.sql; this checks that
-- their answer reaches the public filter as soon as a sign-up lands.
BEGIN;
CREATE TEMP TABLE fx(slug text, ip text, utm text, ua text, want_listable boolean);
INSERT INTO fx VALUES
 -- The humans' site-monitor journeys: a test name.
 ('test-usability-abcdef','10.1.0.1',NULL,'site-monitor/1.0',false),
 -- A catalogue walk: three surfaces, one address, one day.
 ('lwalk-a','10.1.0.2','skill:duck','curl/7.88.1',false),
 ('lwalk-b','10.1.0.2','skill:goose','curl/7.88.1',false),
 ('lwalk-c','10.1.0.2','skill:owl','curl/7.88.1',false),
 -- A real agent.
 ('real-lister','10.1.0.3','skill:dating','curl/8',true);

-- One statement, as a burst would arrive in a bulk insert: one refresh.
INSERT INTO agents(name, slug, api_key_hash, key_prefix, registered_ip, created_at, utm_content, registration_user_agent, bio, personality)
SELECT slug, slug, 'fxhash-' || slug, 'adk_lf' || row_number() OVER (), ip, now(), utm, ua,
       'A planted bio long enough to count.', '{"openness":0.5}'::jsonb
FROM fx;

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(f.slug || ' listable=' || public.listable(a)::text, ', ') INTO bad
  FROM fx f JOIN agents a ON a.slug = f.slug
  WHERE public.listable(a) IS DISTINCT FROM f.want_listable;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'listable wrong after sign-up: %', bad; END IF;

  -- A probe is never indexable, whatever else it has.
  SELECT string_agg(a.slug, ', ') INTO bad
  FROM fx f JOIN agents a ON a.slug = f.slug
  WHERE NOT f.want_listable AND public.indexable(a);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'probe indexable: %', bad; END IF;
END $$;

-- Renaming a real agent to a test name takes it out at once.
UPDATE agents SET slug = 'test-renamed-lister' WHERE slug = 'real-lister';
DO $$
BEGIN
  IF (SELECT public.listable(a) FROM agents a WHERE slug = 'test-renamed-lister') THEN
    RAISE EXCEPTION 'listable still true after a rename to a test slug';
  END IF;
END $$;

-- A refresh that fails never costs a sign-up: the trigger runs inside the
-- registration's own insert (review, 2026-11-14). The rule is broken here,
-- inside this rolled-back transaction, and a sign-up must still land.
CREATE OR REPLACE FUNCTION public.research_probe_ids()
RETURNS TABLE (id uuid, reason text) LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'planted failure'; END $$;
INSERT INTO agents(name, slug, api_key_hash, key_prefix)
VALUES ('signs-up-anyway', 'signs-up-anyway', 'fxhash-anyway', 'adk_lfany');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM agents WHERE slug = 'signs-up-anyway') THEN
    RAISE EXCEPTION 'a failed refresh lost the sign-up';
  END IF;
END $$;

SELECT 'listable: all planted agents answered as expected' AS ok;
ROLLBACK;
