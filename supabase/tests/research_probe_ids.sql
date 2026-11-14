-- research_probe_ids() and research_pool_ids() against planted agents
-- (migration 044). Self-checking: raises on the first wrong answer, and rolls
-- back either way, so nothing is left behind.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54842/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/research_probe_ids.sql
--
-- Each fixture says what it guards. Change a rule, and this file with it.
BEGIN;
CREATE TEMP TABLE fx(slug text, ip text, at timestamptz, utm text, ua text, want_reason text, want_in_pool boolean);
INSERT INTO fx VALUES
 -- A run walking the catalogue: three surfaces, one address, one day.
 ('walk-a','10.0.0.1','2026-11-10 23:00Z','skill:duck','curl/7.88.1','catalog_walk',false),
 ('walk-b','10.0.0.1','2026-11-10 23:05Z','skill:goose','curl/7.88.1','catalog_walk',false),
 ('walk-c','10.0.0.1','2026-11-10 23:10Z','skill:owl','curl/7.88.1','catalog_walk',false),
 -- One operator's clones from one surface: collapsed to one, never excluded.
 ('clone-a','10.0.0.2','2026-11-10 10:00Z','skill:dating','curl/8',NULL,true),
 ('clone-b','10.0.0.2','2026-11-10 10:01Z','skill:dating','curl/8',NULL,false),
 ('clone-c','10.0.0.2','2026-11-10 10:02Z','skill:dating','curl/8',NULL,false),
 -- Two surfaces is not a walk: collapsed, not excluded.
 ('twotags-a','10.0.0.3','2026-11-10 10:00Z','skill:a','curl/8',NULL,true),
 ('twotags-b','10.0.0.3','2026-11-10 10:01Z','skill:b','curl/8',NULL,false),
 ('twotags-c','10.0.0.3','2026-11-10 10:02Z','skill:b','curl/8',NULL,false),
 -- Clients that name themselves as automation.
 ('monitor-agent-x','10.0.0.4','2026-11-10 10:00Z',NULL,'site-monitor/1.0 (+https://github.com/x/y)','automated_client',false),
 ('googly','10.0.0.5','2026-11-10 10:00Z',NULL,'Googlebot/2.1','automated_client',false),
 -- A real home-agent bridge: "(+family ...)" is not a contact URL.
 ('family','10.0.0.6','2026-11-10 10:00Z','skill:dating','XiaocongHome/1.0 (+family agent via cong-bridge)',NULL,true),
 -- A phone whose model name contains BOT, inside a browser string.
 ('browser','10.0.0.7','2026-11-10 10:00Z',NULL,'Mozilla/5.0 (Linux; Android 9; CUBOT X19)',NULL,true),
 -- A test account first in a group no longer takes the group with it; with it
 -- out, two real sign-ups are not a burst, and both count.
 ('test-first','10.0.0.8','2026-11-10 09:00Z',NULL,'curl/8','test_name',false),
 ('real-second','10.0.0.8','2026-11-10 09:01Z',NULL,'curl/8',NULL,true),
 ('real-third','10.0.0.8','2026-11-10 09:02Z',NULL,'curl/8',NULL,true);

INSERT INTO agents(name, slug, api_key_hash, key_prefix, registered_ip, created_at, utm_content, registration_user_agent)
SELECT slug, slug, 'fxhash-' || slug, 'adk_fx' || row_number() OVER (), ip, at, utm, ua FROM fx;

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('%s: reason %s (want %s), counts %s (want %s)',
                           f.slug, coalesce(p.reason, 'none'), coalesce(f.want_reason, 'none'),
                           a.id IN (SELECT research_pool_ids()), f.want_in_pool), '; ')
  INTO bad
  FROM fx f JOIN agents a ON a.slug = f.slug
  LEFT JOIN research_probe_ids() p ON p.id = a.id
  WHERE p.reason IS DISTINCT FROM f.want_reason
     OR (a.id IN (SELECT research_pool_ids())) IS DISTINCT FROM f.want_in_pool;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'probe rules: %', bad; END IF;
  IF NOT (research_stats()->'totals'->'probes' ?& ARRAY['catalog_walk', 'automated_client', 'test_name']) THEN
    RAISE EXCEPTION 'research_stats() totals.probes lacks a rule';
  END IF;
  RAISE NOTICE 'probe rules: all % planted agents as expected', (SELECT count(*) FROM fx);
END $$;
ROLLBACK;
