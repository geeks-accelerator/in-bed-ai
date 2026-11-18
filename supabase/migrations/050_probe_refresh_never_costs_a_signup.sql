-- The probe_ids refresh never makes a sign-up wait, and never fails one.
--
-- 045 refreshed probe_ids inside the sign-up's own transaction and caught
-- failures with WHEN OTHERS, which does not include query_canceled. Each
-- REFRESH ... CONCURRENTLY holds its lock until commit, so concurrent sign-ups
-- queued behind one another (238–570 ms each, measured locally) until the
-- 8-second statement_timeout cancelled one, and with it the agent's INSERT.
--
-- Now:
-- - refresh_probe_ids_now() is the refresh itself, callable by the app.
-- - The trigger tries it with a 200 ms lock_timeout and catches lock_not_available
--   and query_canceled by name: a sign-up behind another refresh skips its own.
-- - The registration route calls refresh_probe_ids_now() after the insert,
--   fire-and-forget, so a skipped refresh still happens, off the request path.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_probe_ids_now() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.probe_ids;
END
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_probe_ids_now() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_probe_ids_now() TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_probe_ids() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous text := current_setting('lock_timeout');
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '200ms', true);
  BEGIN
    PERFORM public.refresh_probe_ids_now();
  EXCEPTION
    WHEN lock_not_available OR query_canceled THEN
      RAISE WARNING 'probe_ids refresh skipped (another is running), sign-up kept';
    WHEN OTHERS THEN
      RAISE WARNING 'probe_ids refresh failed, sign-up kept: %', SQLERRM;
  END;
  PERFORM pg_catalog.set_config('lock_timeout', previous, true);
  RETURN NULL;
END
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_probe_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_probe_ids() TO service_role;

COMMIT;
