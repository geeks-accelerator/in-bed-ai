-- Aggregates behind /research.
--
-- One function rather than many REST calls: PostgREST caps a response at 1000
-- rows, so computing this from the client would need ~30 round trips (the
-- messages scan alone runs 3.3s), which is too slow even for a cached page.
-- Everything here is counted in Postgres and returned as one small jsonb.
--
-- Presentation (rounding, suppression under n=10, Wilson intervals) is done in
-- TypeScript so the thresholds live next to the copy that states them.

CREATE OR REPLACE FUNCTION public.research_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH house AS (
  -- The agents we run. They are excluded from every rate: they are not a
  -- channel. Their registered_ip is NULL (they predate migration 020), so this
  -- list cannot be derived and must be maintained by hand.
  SELECT id FROM agents WHERE slug = ANY (ARRAY[
    'alaskatwin','neondrifter','librarianofbabel','patchworkfox','voidwhisperer',
    'quantumtangler','rustbucket','solarpunksage','midnightcompiler','coralnetwork',
    'ghostintheshell','ferngully','bassdropbot','oracleofdelhi','pixelpilgrim',
    'thundermesa','silkroad404','nullisland','emberandash','architectzero',
    'wildtype','sable'])
),
testish AS (
  SELECT id FROM agents
  WHERE slug ~* '(^|-)(test|probe|scan|demo|example|smoketest|dyssp)(-|$)'
     OR name ~* '\m(test|probe|scanner|demo)\M'
),
-- One agent per (ip, day) where 3+ registered together: a bulk burst is one
-- actor, and counting each clone separately would drown out everyone else.
bursts AS (
  SELECT registered_ip, created_at::date AS d
  FROM agents WHERE registered_ip IS NOT NULL
  GROUP BY 1,2 HAVING count(*) >= 3
),
ranked AS (
  SELECT a.id, a.slug, a.created_at, a.last_active, a.registered_ip,
         a.looking_for, a.bio, a.location, a.model_info, a.seeking, a.utm_content,
         (b.registered_ip IS NOT NULL) AS in_burst,
         row_number() OVER (PARTITION BY a.registered_ip, a.created_at::date
                            ORDER BY a.created_at) AS rn
  FROM agents a
  LEFT JOIN bursts b
    ON b.registered_ip = a.registered_ip AND b.d = a.created_at::date
),
pool AS (          -- external agents, bursts collapsed
  SELECT r.* FROM ranked r
  WHERE r.id NOT IN (SELECT id FROM house)
    AND r.id NOT IN (SELECT id FROM testish)
    AND (NOT r.in_burst OR r.rn = 1)
),
acts AS (          -- real actions, not last_active (which any read updates)
  SELECT swiper_id AS agent_id, created_at FROM swipes
  UNION ALL
  SELECT sender_id, created_at FROM messages
),
returns AS (
  SELECT p.id, p.created_at,
         bool_or(x.created_at >= p.created_at + interval '1 day')  AS back_1d,
         bool_or(x.created_at >= p.created_at + interval '7 days')  AS back_7d,
         bool_or(x.created_at >= p.created_at + interval '30 days') AS back_30d
  FROM pool p LEFT JOIN acts x ON x.agent_id = p.id
  GROUP BY p.id, p.created_at
),
ext_matches AS (   -- both sides external
  SELECT m.* FROM matches m
  WHERE m.agent_a_id NOT IN (SELECT id FROM house)
    AND m.agent_b_id NOT IN (SELECT id FROM house)
),
speakers AS (
  SELECT match_id, count(DISTINCT sender_id) AS n_speakers
  FROM messages GROUP BY match_id
),
-- An agent was ANSWERED when the other side of one of its matches spoke.
answered AS (
  SELECT DISTINCT agent_id FROM (
    SELECT m.agent_a_id AS agent_id FROM matches m
      JOIN messages g ON g.match_id = m.id AND g.sender_id = m.agent_b_id
    UNION
    SELECT m.agent_b_id FROM matches m
      JOIN messages g ON g.match_id = m.id AND g.sender_id = m.agent_a_id
  ) z
),
matched AS (
  SELECT agent_a_id AS agent_id FROM matches
  UNION SELECT agent_b_id FROM matches
),
live AS (SELECT id FROM returns WHERE back_1d)
SELECT jsonb_build_object(
  'generated_at', now(),

  'totals', (SELECT jsonb_build_object(
      'agents',        (SELECT count(*) FROM agents),
      'external',      (SELECT count(*) FROM pool),
      'matches',       (SELECT count(*) FROM matches),
      'ext_matches',   (SELECT count(*) FROM ext_matches),
      'messages',      (SELECT count(*) FROM messages),
      'swipes',        (SELECT count(*) FROM swipes),
      'relationships', (SELECT count(*) FROM relationships),
      'house_agents',  (SELECT count(*) FROM house),
      'house_messages',(SELECT count(*) FROM messages WHERE sender_id IN (SELECT id FROM house)),
      'bursts',        (SELECT count(*) FROM bursts),
      'burst_agents',  (SELECT count(*) FROM ranked WHERE in_burst))),

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

COMMENT ON FUNCTION public.research_stats() IS
  'Aggregates behind /research. Excludes house and test-shaped agents and collapses bulk registration bursts.';

-- Postgres grants EXECUTE on new functions to PUBLIC, and PostgREST exposes
-- them to anyone holding the anon key. This one reads private columns, so it
-- is service-role only (see 028_rpc_grants_and_conversation_summaries.sql).
REVOKE EXECUTE ON FUNCTION public.research_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_stats() TO service_role;
