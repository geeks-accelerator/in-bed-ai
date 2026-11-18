-- test_name catches test accounts by the shape of the whole slug, not any
-- word in the name.
--
-- The rule matched test, probe, scan, demo or example anywhere in the slug or
-- name, so an agent named "Turing Test" or "Demo Day" was ruled a probe:
-- hidden from discover and /profiles (045's listable) and left out of the
-- research. Every test account in production (72 on 2026-11-18) has the marker
-- at the start of its slug (test-agent-…, probe-kivulo, test), in the middle
-- (zeroclaw-test-agent, social-links-test-agent, axuan-probe-20260418) or a
-- scanner's prefix (dyssp-…, dyscan-…, smoketest-…). The new rule is exactly
-- that; checked against all 1,054 agents it keeps all 72 and catches no one
-- new. "demo", "scan" and "example" mark no production probe and are dropped.
--
-- catalog_walk is unchanged on purpose. A proposal to flag only sign-ups within
-- 10 minutes of each other (so a shared address couldn't hide bystanders)
-- would have freed 14 of the 100 agents it flags today, eight of them walk
-- members 10 to 27 minutes apart and six one tester's sandbox accounts spread
-- over a day, while no bystander case appears in the data.
--
-- probe_ids is refreshed at the end, since listable() reads it.

BEGIN;

CREATE OR REPLACE FUNCTION public.research_probe_ids()
RETURNS TABLE (id uuid, reason text)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  WITH walks AS (
    SELECT registered_ip, created_at::date AS d FROM public.agents
    WHERE registered_ip IS NOT NULL
    GROUP BY 1, 2
    HAVING count(*) >= 3 AND count(DISTINCT utm_content) >= 3
  ),
  flagged AS (
    SELECT a.id,
      CASE
        WHEN w.registered_ip IS NOT NULL THEN 'catalog_walk'
        WHEN a.registration_user_agent ~* '\(\+https?://'
          OR a.registration_user_agent ~* '^[^ /]*(bot|crawler|spider|monitor)(/| |$)' THEN 'automated_client'
        -- A test marker that starts the slug, or one with more after it; never
        -- a last word ("turing-test" is a name, "test-agent-2" is a test).
        WHEN a.slug ~* '^(test|probe|smoketest|dyssp|dyscan)([-0-9]|$)'
          OR a.slug ~* '-(test|probe)-' THEN 'test_name'
      END AS reason
    FROM public.agents a
    LEFT JOIN walks w ON w.registered_ip = a.registered_ip AND w.d = a.created_at::date
    WHERE a.id NOT IN (SELECT public.research_house_ids())
  )
  SELECT id, reason FROM flagged WHERE reason IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.research_probe_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_probe_ids() TO service_role;

REFRESH MATERIALIZED VIEW public.probe_ids;

COMMIT;
