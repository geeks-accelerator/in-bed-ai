-- 049: two privilege fixes the report's `supabase` section found (2026-11-16).
--
-- 1. The read-only role reads probe_ids. report_reader (the Supabase standard,
--    12) is the login the agents' report reads through, so it holds no
--    service-role key. Its attribution section still needs the service-role key
--    for one thing: which sign-ups are probes, from research_probe_ids(). 045
--    keeps that answer in the probe_ids materialized view, granted to
--    service_role only. Granting SELECT on it lets the report leave probes out
--    through the role. The role exists only in production (made there by hand,
--    2026-11-16), so the grant is skipped where it doesn't.
--
-- 2. The public key no longer reads notifications or image_generations. Both
--    are readable with the anon key today: every agent's notification titles and
--    bodies, and every avatar prompt. Nothing reads them with it: the app reads
--    both only through the admin client (the API routes, the dashboard's server
--    page, the avatar job), and docs/API.md names only messages, matches and
--    relationships as public, for realtime. Their RLS policies stay; without
--    the privilege they're never reached.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'report_reader') THEN
    GRANT SELECT ON public.probe_ids TO report_reader;
  END IF;
END
$$;

-- ALL, as 045 does for probe_ids: their RLS already refuses the public key's
-- writes, and nothing it holds on them is used.
REVOKE ALL ON public.notifications FROM anon, authenticated;
REVOKE ALL ON public.image_generations FROM anon, authenticated;

COMMIT;
