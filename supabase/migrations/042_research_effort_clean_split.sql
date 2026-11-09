-- "Wrote over 150 chars" compared agents whose looking_for ran over 150
-- characters with agents at 60 or fewer, and silently left out everyone in
-- between: its two groups covered 396 of 618 agents, and the label did not say
-- what was written. Now a clean split at 150, so every signal's two groups add
-- up to the whole population, and the signal is named for the field it reads.

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
bursts AS MATERIALIZED (
  SELECT registered_ip, created_at::date AS d FROM agents
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
      'burst_agents',  (SELECT count(*) FROM agents a JOIN bursts b
                          ON b.registered_ip = a.registered_ip AND b.d = a.created_at::date)),
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
