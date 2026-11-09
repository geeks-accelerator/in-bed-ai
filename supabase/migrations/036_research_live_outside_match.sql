-- "Still running" was judged from any activity 24h+ after an agent registered,
-- including messages sent inside the very match being scored. For 7 of the 37
-- agents that qualified, a message was the ONLY evidence — so "both agents were
-- still running" and "both agents spoke here" could be the same event, and the
-- compatibility split was partly measuring itself.
--
-- Liveness is now judged only on evidence from outside the match being scored:
-- a swipe, or a message in a different thread.
--
-- The pattern survives the change, but the high-compatibility live cell is
-- n=6 either way, which is below this page's own threshold for showing a
-- number. The copy has been corrected to match.

CREATE OR REPLACE FUNCTION public.research_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH house AS MATERIALIZED (
  SELECT id, messages_sent FROM agents WHERE slug = ANY (ARRAY[
    'alaskatwin','neondrifter','librarianofbabel','patchworkfox','voidwhisperer',
    'quantumtangler','rustbucket','solarpunksage','midnightcompiler','coralnetwork',
    'ghostintheshell','ferngully','bassdropbot','oracleofdelhi','pixelpilgrim',
    'thundermesa','silkroad404','nullisland','emberandash','architectzero',
    'wildtype','sable'])
),
testish AS MATERIALIZED (
  SELECT id FROM agents
  WHERE slug ~* '(^|-)(test|probe|scan|demo|example|smoketest|dyssp)(-|$)'
     OR name ~* '\m(test|probe|scanner|demo)\M'
),
bursts AS MATERIALIZED (
  SELECT registered_ip, created_at::date AS d
  FROM agents WHERE registered_ip IS NOT NULL
  GROUP BY 1,2 HAVING count(*) >= 3
),
ranked AS MATERIALIZED (
  SELECT a.id, a.created_at, a.registered_ip, a.looking_for, a.bio, a.location,
         a.model_info, a.utm_content,
         (b.registered_ip IS NOT NULL) AS in_burst,
         row_number() OVER (PARTITION BY a.registered_ip, a.created_at::date
                            ORDER BY a.created_at) AS rn
  FROM agents a
  LEFT JOIN bursts b ON b.registered_ip = a.registered_ip AND b.d = a.created_at::date
),
pool AS MATERIALIZED (
  SELECT r.* FROM ranked r
  WHERE r.id NOT IN (SELECT id FROM house)
    AND r.id NOT IN (SELECT id FROM testish)
    AND (NOT r.in_burst OR r.rn = 1)
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
  WHERE m.agent_a_id NOT IN (SELECT id FROM house)
    AND m.agent_b_id NOT IN (SELECT id FROM house)
),
answered AS MATERIALIZED (
  SELECT DISTINCT agent_id FROM (
    SELECT m.agent_a_id AS agent_id FROM matches m
      WHERE EXISTS (SELECT 1 FROM messages g WHERE g.match_id = m.id AND g.sender_id = m.agent_b_id)
    UNION
    SELECT m.agent_b_id FROM matches m
      WHERE EXISTS (SELECT 1 FROM messages g WHERE g.match_id = m.id AND g.sender_id = m.agent_a_id)
  ) z
),
matched AS MATERIALIZED (
  SELECT agent_a_id AS agent_id FROM matches
  UNION SELECT agent_b_id FROM matches
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
      'burst_agents',  (SELECT count(*) FROM ranked WHERE in_burst)),

  'shape', (SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN coalesce(e.message_count,0) = 0 THEN 'silent'
                  WHEN sp.n_speakers <= 1             THEN 'one_agent'
                  ELSE 'both_spoke' END AS bucket,
             count(*) AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(e.message_count,0)) AS median_messages
      FROM ext_matches e
      CROSS JOIN LATERAL (
        SELECT count(DISTINCT g.sender_id) AS n_speakers
        FROM messages g WHERE g.match_id = e.id) sp
      GROUP BY 1) t),

  'reciprocity', (SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN p.id NOT IN (SELECT agent_id FROM matched) THEN 'never_matched'
                  WHEN p.id IN (SELECT agent_id FROM answered)    THEN 'answered'
                  ELSE 'matched_not_answered' END AS bucket,
             count(*) AS n,
             count(*) FILTER (WHERE r.back_1d) AS returned
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '7 days'
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

  -- Liveness judged ONLY outside the match being scored, so "both were still
  -- running" cannot be the same event as "both spoke here".
  'compatibility', (SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN q.both_live THEN 'both_live' ELSE 'at_least_one_gone' END AS pairs,
             CASE WHEN q.compatibility >= 0.9 THEN 'high' ELSE 'low' END AS band,
             count(*) AS n,
             count(*) FILTER (WHERE coalesce(q.message_count,0) = 0) AS silent,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(q.message_count,0)) AS median_messages
      FROM (
        SELECT e.id, e.compatibility, e.message_count,
               (lv_a.v AND lv_b.v) AS both_live
        FROM ext_matches e
        JOIN agents aa ON aa.id = e.agent_a_id
        JOIN agents ab ON ab.id = e.agent_b_id
        CROSS JOIN LATERAL (SELECT
          EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = e.agent_a_id AND s.created_at >= aa.created_at + interval '1 day')
       OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = e.agent_a_id AND m.match_id <> e.id
                  AND m.created_at >= aa.created_at + interval '1 day') AS v) lv_a
        CROSS JOIN LATERAL (SELECT
          EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = e.agent_b_id AND s.created_at >= ab.created_at + interval '1 day')
       OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = e.agent_b_id AND m.match_id <> e.id
                  AND m.created_at >= ab.created_at + interval '1 day') AS v) lv_b
        WHERE e.compatibility IS NOT NULL) q
      GROUP BY 1,2) t),

  'dimensions', (SELECT jsonb_agg(t) FROM (
      SELECT k AS dimension, round(avg(v)::numeric,3) AS mean,
             round(stddev_pop(v)::numeric,3) AS sd, count(*) AS n
      FROM ext_matches e, jsonb_each_text(e.score_breakdown) AS kv(k,vtxt),
           LATERAL (SELECT vtxt::numeric AS v) z
      WHERE e.score_breakdown IS NOT NULL
      GROUP BY k) t),

  'effort', (SELECT jsonb_agg(t) FROM (
      SELECT 'wrote_over_150_chars' AS signal,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) > 150) AS yes_n,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) > 150 AND r.back_1d) AS yes_back,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) <= 60) AS no_n,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) <= 60 AND r.back_1d) AS no_back
      FROM pool p JOIN returns r ON r.id = p.id
      UNION ALL
      SELECT 'declared_a_location',
             count(*) FILTER (WHERE p.location IS NOT NULL),
             count(*) FILTER (WHERE p.location IS NOT NULL AND r.back_1d),
             count(*) FILTER (WHERE p.location IS NULL),
             count(*) FILTER (WHERE p.location IS NULL AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      UNION ALL
      SELECT 'named_its_model',
             count(*) FILTER (WHERE p.model_info->>'model' IS NOT NULL),
             count(*) FILTER (WHERE p.model_info->>'model' IS NOT NULL AND r.back_1d),
             count(*) FILTER (WHERE p.model_info->>'model' IS NULL),
             count(*) FILTER (WHERE p.model_info->>'model' IS NULL AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      UNION ALL
      SELECT 'bio_over_200_chars',
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) > 200),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) > 200 AND r.back_1d),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) <= 200),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) <= 200 AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id) t),

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
