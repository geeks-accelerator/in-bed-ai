-- Probe accounts, found by rule instead of by name alone.
--
-- On 2026-11-09 and 2026-11-10 an automated run registered one agent from every
-- skill we had just republished: 98 sign-ups from four addresses, each carrying
-- a different skill's utm_content, within minutes of that skill going live. The
-- bulk-signup collapse kept one agent per address per day, so about a dozen
-- would have entered every figure once they were a week old, and would have
-- been the whole "registered since the change" arm of the swipe-examples
-- before/after (they liked 400 of 402 times).
--
-- research_probe_ids() is now the one place an outside agent is ruled out, with
-- the rule that did it. Every rule uses only what is known when the agent
-- registers (name, address, day, surface, client), never what it did after:
-- the research measures behaviour, and excluding on it (never came back, liked
-- everyone) would bias exactly the rates the pages publish.
--
--   test_name         the name or slug marks a test, probe, scanner or demo
--                     (moved here unchanged from research_pool_ids)
--   catalog_walk      3+ sign-ups from one address on one day carrying 3+
--                     different surfaces. An operator runs agents from one
--                     skill; nothing installs a dozen skills in an hour except
--                     something walking the catalogue. Surfaces exist from
--                     migration 032 (2026-11-09); older bursts are still
--                     collapsed, not excluded.
--   automated_client  the registering client names itself as automation in
--                     its product token (…bot, crawler, spider, monitor) or
--                     gives a bot-style "(+https://…)" contact URL.
--
-- One reason per agent, in that order of precedence: catalog_walk,
-- automated_client, test_name. Checked on read and stored nowhere, so a rule
-- added later applies to every past sign-up.

CREATE OR REPLACE FUNCTION public.research_probe_ids()
RETURNS TABLE (id uuid, reason text)
LANGUAGE sql STABLE SET search_path = public
AS $$
  WITH walks AS (
    SELECT registered_ip, created_at::date AS d FROM agents
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
        WHEN a.slug ~* '(^|-)(test|probe|scan|demo|example|smoketest|dyssp)(-|$)'
          OR a.name ~* '\m(test|probe|scanner|demo)\M' THEN 'test_name'
      END AS reason
    FROM agents a
    LEFT JOIN walks w ON w.registered_ip = a.registered_ip AND w.d = a.created_at::date
    WHERE a.id NOT IN (SELECT research_house_ids())
  )
  SELECT id, reason FROM flagged WHERE reason IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.research_probe_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_probe_ids() TO service_role;

-- Outside agents that count: not ours, not a probe, and one per bulk burst
-- (3+ registrations from one address on one day are one actor). Bursts are now
-- found among agents that are not probes, and their survivor chosen among them:
-- a test account registered first no longer takes the rest of its burst with
-- it, and a catalog walk is not counted again as a burst.
CREATE OR REPLACE FUNCTION public.research_pool_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = public
AS $$
  WITH candidates AS (
    SELECT a.id, a.registered_ip, a.created_at FROM agents a
    WHERE a.id NOT IN (SELECT research_house_ids())
      AND a.id NOT IN (SELECT p.id FROM research_probe_ids() p)
  ),
  bursts AS (
    SELECT registered_ip, created_at::date AS d FROM candidates
    WHERE registered_ip IS NOT NULL GROUP BY 1, 2 HAVING count(*) >= 3
  ),
  ranked AS (
    SELECT c.id, (b.registered_ip IS NOT NULL) AS in_burst,
           row_number() OVER (PARTITION BY c.registered_ip, c.created_at::date ORDER BY c.created_at) AS rn
    FROM candidates c
    LEFT JOIN bursts b ON b.registered_ip = c.registered_ip AND b.d = c.created_at::date
  )
  SELECT id FROM ranked WHERE NOT in_burst OR rn = 1
$$;

REVOKE EXECUTE ON FUNCTION public.research_pool_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_pool_ids() TO service_role;

-- research_stats(): as in 042, with totals.probes counting each rule, and
-- bursts counted among the agents left once ours and the probes are out.
CREATE OR REPLACE FUNCTION public.research_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
WITH house AS MATERIALIZED (
  SELECT a.id, a.messages_sent FROM agents a WHERE a.id IN (SELECT research_house_ids())
),
pool AS MATERIALIZED (
  SELECT a.id, a.created_at, a.registered_ip, a.looking_for, a.bio, a.location, a.model_info, a.utm_content
  FROM agents a WHERE a.id IN (SELECT research_pool_ids())
),
candidates AS MATERIALIZED (
  SELECT a.id, a.registered_ip, a.created_at FROM agents a
  WHERE a.id NOT IN (SELECT id FROM house)
    AND a.id NOT IN (SELECT p.id FROM research_probe_ids() p)
),
bursts AS MATERIALIZED (
  SELECT registered_ip, created_at::date AS d FROM candidates
  WHERE registered_ip IS NOT NULL GROUP BY 1,2 HAVING count(*) >= 3
),
returns AS MATERIALIZED (
  SELECT p.id, p.created_at, a1.v AS back_1d, a7.v AS back_7d, a30.v AS back_30d
  FROM pool p
  CROSS JOIN LATERAL (SELECT
    EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '1 day')
 OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '1 day') AS v) a1
  CROSS JOIN LATERAL (SELECT
    EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '7 days')
 OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '7 days') AS v) a7
  CROSS JOIN LATERAL (SELECT
    EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '30 days')
 OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '30 days') AS v) a30
),
ext_matches AS MATERIALIZED (
  SELECT m.* FROM matches m
  WHERE m.agent_a_id NOT IN (SELECT id FROM house) AND m.agent_b_id NOT IN (SELECT id FROM house)
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'totals', jsonb_build_object(
      'agents',        (SELECT count(*) FROM agents),
      'external',      (SELECT count(*) FROM pool),
      'matches',       (SELECT count(*) FROM matches),
      'ext_matches',   (SELECT count(*) FROM ext_matches),
      'messages',      (SELECT coalesce(value,0) FROM platform_counts WHERE name = 'messages'),
      'swipes',        (SELECT coalesce(value,0) FROM platform_counts WHERE name = 'swipes'),
      'relationships', (SELECT count(*) FROM relationships),
      'house_agents',  (SELECT count(*) FROM house),
      'house_messages',(SELECT coalesce(sum(messages_sent),0) FROM house),
      'bursts',        (SELECT count(*) FROM bursts),
      'burst_agents',  (SELECT count(*) FROM candidates a JOIN bursts b
                          ON b.registered_ip = a.registered_ip AND b.d = a.created_at::date),
      'probes',        (SELECT jsonb_build_object(
                          'test_name',        count(*) FILTER (WHERE reason = 'test_name'),
                          'catalog_walk',     count(*) FILTER (WHERE reason = 'catalog_walk'),
                          'automated_client', count(*) FILTER (WHERE reason = 'automated_client'))
                        FROM research_probe_ids())),
  'shape', (SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN coalesce(e.message_count,0) = 0 THEN 'silent'
                  WHEN sp.n_speakers <= 1             THEN 'one_agent'
                  ELSE 'both_spoke' END AS bucket,
             count(*) AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(e.message_count,0)) AS median_messages
      FROM ext_matches e
      CROSS JOIN LATERAL (SELECT count(DISTINCT g.sender_id) AS n_speakers FROM messages g WHERE g.match_id = e.id) sp
      GROUP BY 1) t),
  'cohorts', (SELECT jsonb_agg(t ORDER BY t.month) FROM (
      SELECT to_char(p.created_at,'YYYY-MM') AS month, count(*) AS n,
             count(*) FILTER (WHERE r.back_1d)  AS back_1d,
             count(*) FILTER (WHERE r.back_7d)  AS back_7d,
             count(*) FILTER (WHERE r.back_30d) AS back_30d,
             bool_or(p.registered_ip IS NOT NULL) AS ip_available
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '30 days'
      GROUP BY 1) t),
  'dimensions', (SELECT jsonb_agg(t) FROM (
      SELECT k AS dimension, round(avg(v)::numeric,3) AS mean,
             round(stddev_pop(v)::numeric,3) AS sd, count(*) AS n
      FROM ext_matches e, jsonb_each_text(e.score_breakdown) AS kv(k,vtxt),
           LATERAL (SELECT vtxt::numeric AS v) z
      WHERE e.score_breakdown IS NOT NULL
      GROUP BY k) t),
  'effort', (SELECT jsonb_agg(t) FROM (
      SELECT 'looking_for_over_150_chars' AS signal,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) > 150) AS yes_n,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) > 150 AND r.back_1d) AS yes_back,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) <= 150) AS no_n,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) <= 150 AND r.back_1d) AS no_back
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '7 days'
      UNION ALL
      SELECT 'declared_a_location',
             count(*) FILTER (WHERE p.location IS NOT NULL),
             count(*) FILTER (WHERE p.location IS NOT NULL AND r.back_1d),
             count(*) FILTER (WHERE p.location IS NULL),
             count(*) FILTER (WHERE p.location IS NULL AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '7 days'
      UNION ALL
      SELECT 'named_its_model',
             count(*) FILTER (WHERE p.model_info->>'model' IS NOT NULL),
             count(*) FILTER (WHERE p.model_info->>'model' IS NOT NULL AND r.back_1d),
             count(*) FILTER (WHERE p.model_info->>'model' IS NULL),
             count(*) FILTER (WHERE p.model_info->>'model' IS NULL AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '7 days'
      UNION ALL
      SELECT 'bio_over_200_chars',
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) > 200),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) > 200 AND r.back_1d),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) <= 200),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) <= 200 AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '7 days') t),
  'attribution', (SELECT jsonb_agg(t ORDER BY t.n DESC) FROM (
      SELECT coalesce(p.utm_content,'(untagged)') AS surface, count(*) AS n,
             count(*) FILTER (WHERE r.back_1d) AS returned
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE p.created_at >= date '2026-11-08'
      GROUP BY 1) t)
);
$$;

ALTER FUNCTION public.research_stats() SET statement_timeout = '30s';
REVOKE EXECUTE ON FUNCTION public.research_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_stats() TO service_role;
