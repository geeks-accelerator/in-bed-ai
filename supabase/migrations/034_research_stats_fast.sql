-- research_stats() timed out on production (57014, ~8s) and /research rendered
-- its "could not be read" state. Three causes, all of them mine:
--
--  1. It counted messages by sender_id and count(*)'d the big tables, which
--     CLAUDE.md says plainly not to do: agents.messages_sent and
--     platform_counts are kept exact by triggers (migrations 030, 031).
--  2. `speakers` grouped the whole 356k-row messages table when only the ~190
--     external matches are ever read from it.
--  3. `returns` LEFT JOINed a UNION ALL of swipes+messages (369k rows) against
--     the agent pool, so the planner materialized the union instead of using
--     the per-sender indexes.
--
-- Rewritten to probe indexes per agent. Every CTE is MATERIALIZED so the
-- planner cannot re-evaluate `returns` once per reference and put the
-- timeout back. Also adds the composite index that
-- makes the "did this agent act after date X" test index-only.

CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages (sender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_swipes_swiper_created  ON public.swipes   (swiper_id, created_at);

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
-- One index probe per agent per horizon instead of a join against every row
-- ever written. EXISTS stops at the first hit.
returns AS MATERIALIZED (
  SELECT p.id, p.created_at,
         acted_1d.v  AS back_1d,
         acted_7d.v  AS back_7d,
         acted_30d.v AS back_30d
  FROM pool p
  CROSS JOIN LATERAL (SELECT
    EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '1 day')
 OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '1 day') AS v) acted_1d
  CROSS JOIN LATERAL (SELECT
    EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '7 days')
 OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '7 days') AS v) acted_7d
  CROSS JOIN LATERAL (SELECT
    EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '30 days')
 OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '30 days') AS v) acted_30d
),
ext_matches AS MATERIALIZED (
  SELECT m.* FROM matches m
  WHERE m.agent_a_id NOT IN (SELECT id FROM house)
    AND m.agent_b_id NOT IN (SELECT id FROM house)
),
-- Only the external matches are ever read from here, so never group the lot.
speakers AS MATERIALIZED (
  SELECT g.match_id, count(DISTINCT g.sender_id) AS n_speakers
  FROM messages g
  WHERE g.match_id IN (SELECT id FROM ext_matches)
  GROUP BY g.match_id
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
),
live AS MATERIALIZED (SELECT id FROM returns WHERE back_1d)
SELECT jsonb_build_object(
  'generated_at', now(),

  'totals', jsonb_build_object(
      'agents',        (SELECT count(*) FROM agents),
      'external',      (SELECT count(*) FROM pool),
      'matches',       (SELECT count(*) FROM matches),
      'ext_matches',   (SELECT count(*) FROM ext_matches),
      -- trigger-maintained (migration 031); never count(*) these
      'messages',      (SELECT coalesce(value,0) FROM platform_counts WHERE name = 'messages'),
      'swipes',        (SELECT coalesce(value,0) FROM platform_counts WHERE name = 'swipes'),
      'relationships', (SELECT count(*) FROM relationships),
      'house_agents',  (SELECT count(*) FROM house),
      -- trigger-maintained per agent (migration 031); never count by sender_id
      'house_messages',(SELECT coalesce(sum(messages_sent),0) FROM house),
      'bursts',        (SELECT count(*) FROM bursts),
      'burst_agents',  (SELECT count(*) FROM ranked WHERE in_burst)),

  'shape', (SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN coalesce(e.message_count,0) = 0 THEN 'silent'
                  WHEN coalesce(s.n_speakers,0) <= 1  THEN 'one_agent'
                  ELSE 'both_spoke' END AS bucket,
             count(*) AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(e.message_count,0)) AS median_messages
      FROM ext_matches e LEFT JOIN speakers s ON s.match_id = e.id
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

  'compatibility', (SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN a_live AND b_live THEN 'both_live' ELSE 'at_least_one_gone' END AS pairs,
             CASE WHEN compatibility >= 0.9 THEN 'high' ELSE 'low' END AS band,
             count(*) AS n,
             count(*) FILTER (WHERE coalesce(message_count,0) = 0) AS silent,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(message_count,0)) AS median_messages
      FROM (SELECT e.*, (e.agent_a_id IN (SELECT id FROM live)) AS a_live,
                        (e.agent_b_id IN (SELECT id FROM live)) AS b_live
            FROM ext_matches e WHERE e.compatibility IS NOT NULL) q
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

REVOKE EXECUTE ON FUNCTION public.research_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_stats() TO service_role;
