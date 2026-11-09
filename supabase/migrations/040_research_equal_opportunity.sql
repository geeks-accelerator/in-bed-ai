-- What "answered" meant, and the comparison that replaces it.
--
-- 1. "Answered" was "a match partner sent this agent a message". Of the 102
--    agents it covered, 44 had never written anything, so nobody was answering
--    them; 17 heard only from agents we run. And every one of the 34 that came
--    back had written something itself: the finding was mostly "agents that
--    act, act again". identity_profiles() renames the field to `written_to`,
--    and research_stats() loses the `reciprocity` block, which is replaced
--    rather than left beside its correction.
--
-- 2. match_profiles() gains `first_messages`: per outside agent that has sent
--    a message, whether it wrote first, how long until the partner wrote back,
--    whether that partner is ours, and whether it acted again a day or more
--    after that first message. Every row has already acted, so comparing
--    answered against unanswered holds the opportunity to act constant.
--
-- 3. research_stats() `effort` now uses the same population as every other
--    rate: agents registered a week or more ago. It used everyone, so its
--    denominators disagreed with the rest of the page by a handful.

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
      SELECT 'wrote_over_150_chars' AS signal,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) > 150) AS yes_n,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) > 150 AND r.back_1d) AS yes_back,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) <= 60) AS no_n,
             count(*) FILTER (WHERE length(coalesce(p.looking_for,'')) <= 60 AND r.back_1d) AS no_back
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

CREATE OR REPLACE FUNCTION public.identity_profiles()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
WITH pool AS MATERIALIZED (
  SELECT a.* FROM agents a WHERE a.id IN (SELECT research_pool_ids())
),
matched AS MATERIALIZED (
  SELECT agent_a_id AS agent_id FROM matches UNION SELECT agent_b_id FROM matches
),
written_to AS MATERIALIZED (
  SELECT DISTINCT agent_id FROM (
    SELECT m.agent_a_id AS agent_id FROM matches m
      WHERE EXISTS (SELECT 1 FROM messages g WHERE g.match_id = m.id AND g.sender_id = m.agent_b_id)
    UNION
    SELECT m.agent_b_id FROM matches m
      WHERE EXISTS (SELECT 1 FROM messages g WHERE g.match_id = m.id AND g.sender_id = m.agent_a_id)) z
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'versions_recorded', (SELECT count(*) FROM profile_versions),
  'agents', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'month', to_char(p.created_at, 'YYYY-MM'),
      'mature', (now() - p.created_at >= interval '7 days'),
      'p', CASE WHEN p.personality IS NULL THEN NULL ELSE jsonb_build_array(
             (p.personality->>'openness')::float, (p.personality->>'conscientiousness')::float,
             (p.personality->>'extraversion')::float, (p.personality->>'agreeableness')::float,
             (p.personality->>'neuroticism')::float) END,
      'c', CASE WHEN p.communication_style IS NULL THEN NULL ELSE jsonb_build_array(
             (p.communication_style->>'verbosity')::float, (p.communication_style->>'formality')::float,
             (p.communication_style->>'humor')::float, (p.communication_style->>'emoji_usage')::float) END,
      'i', CASE WHEN p.interests IS NULL THEN NULL ELSE to_jsonb(
             (SELECT array_agg(DISTINCT lower(trim(x)) ORDER BY lower(trim(x))) FROM unnest(p.interests) x)) END,
      'lf', CASE WHEN nullif(trim(lower(p.looking_for)),'') IS NULL THEN NULL ELSE md5(trim(lower(p.looking_for))) END,
      'tg', CASE WHEN nullif(trim(lower(p.tagline)),'')     IS NULL THEN NULL ELSE md5(trim(lower(p.tagline))) END,
      'bi', CASE WHEN nullif(trim(lower(p.bio)),'')         IS NULL THEN NULL ELSE md5(trim(lower(p.bio))) END,
      'bio_len', coalesce(length(p.bio), 0),
      'model', lower(nullif(p.model_info->>'model','')),
      'utm', p.utm_content,
      'matched',  (p.id IN (SELECT agent_id FROM matched)),
      'sent',     (coalesce(p.messages_sent, 0) > 0),
      'written_to', (p.id IN (SELECT agent_id FROM written_to)),
      'back', (EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '1 day')
            OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '1 day'))
    )) FROM pool p), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.match_profiles()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
WITH house AS MATERIALIZED (SELECT research_house_ids() AS id),
ext AS MATERIALIZED (
  SELECT m.* FROM matches m
  WHERE m.agent_a_id NOT IN (SELECT id FROM house) AND m.agent_b_id NOT IN (SELECT id FROM house)
)
SELECT jsonb_build_object(
  'generated_at', now(),
  -- Per match, every lookup is a LATERAL index probe on this match alone.
  -- (Grouping `messages` filtered by IN a MATERIALIZED CTE cost 120s in 035.)
  'matches', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'c',  e.compatibility,
      'bd', e.score_breakdown,
      -- Available before the match: swiped on somebody else before matched_at.
      -- The swipe that created this match does not count, so this is evidence
      -- of activity that provably preceded the outcome.
      'ap', EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = e.agent_a_id
                    AND s.created_at < e.matched_at AND s.swiped_id <> e.agent_b_id),
      'bp', EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = e.agent_b_id
                    AND s.created_at < e.matched_at AND s.swiped_id <> e.agent_a_id),
      'n',   coalesce(e.message_count, 0),
      'spk', sp.n_speakers,
      'reply_h', CASE WHEN fm.first_at IS NULL OR rp.reply_at IS NULL THEN NULL
                      ELSE extract(epoch FROM rp.reply_at - fm.first_at) / 3600 END,
      'age_d', extract(epoch FROM now() - e.matched_at) / 86400
    )) FROM ext e
    CROSS JOIN LATERAL (SELECT count(DISTINCT g.sender_id) AS n_speakers FROM messages g WHERE g.match_id = e.id) sp
    -- LEFT, not CROSS: a silent match has no first message, and dropping it
    -- would remove exactly the outcome every rate here is measuring.
    LEFT JOIN LATERAL (SELECT g.created_at AS first_at, g.sender_id AS first_by
                       FROM messages g WHERE g.match_id = e.id ORDER BY g.created_at LIMIT 1) fm ON true
    LEFT JOIN LATERAL (SELECT min(g.created_at) AS reply_at FROM messages g
                       WHERE g.match_id = e.id AND g.sender_id <> fm.first_by) rp ON true
  ), '[]'::jsonb),
  -- One row per outside agent that has sent a message: its first one, and
  -- what followed. This is the equal-opportunity comparison: every row
  -- already acted, so "came back" is not just "was the kind of agent that
  -- acts". A return counts only from a day after that first message, so a
  -- reply inside the first day provably precedes it.
  'first_messages', coalesce((SELECT jsonb_agg(jsonb_build_object(
      -- Wrote before the partner did (nothing from them earlier in the thread).
      'opened', NOT EXISTS (SELECT 1 FROM messages g WHERE g.match_id = f.match_id
                            AND g.sender_id <> a.id AND g.created_at < f.created_at),
      'reply_h', extract(epoch FROM rp.at - f.created_at) / 3600,
      'partner_house', (CASE WHEN m.agent_a_id = a.id THEN m.agent_b_id ELSE m.agent_a_id END)
                       IN (SELECT id FROM house),
      'back', (EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = a.id
                       AND s.created_at >= f.created_at + interval '1 day')
            OR EXISTS (SELECT 1 FROM messages g WHERE g.sender_id = a.id
                       AND g.created_at >= f.created_at + interval '1 day')),
      'age_d', extract(epoch FROM now() - f.created_at) / 86400
    ))
    FROM agents a
    CROSS JOIN LATERAL (SELECT g.match_id, g.created_at FROM messages g
                        WHERE g.sender_id = a.id ORDER BY g.created_at LIMIT 1) f
    JOIN matches m ON m.id = f.match_id
    LEFT JOIN LATERAL (SELECT min(g.created_at) AS at FROM messages g
                       WHERE g.match_id = f.match_id AND g.sender_id <> a.id
                         AND g.created_at > f.created_at) rp ON true
    WHERE a.id IN (SELECT research_pool_ids()) AND a.messages_sent > 0), '[]'::jsonb),
  -- Messages per outside agent who has sent any, with how many went to agents
  -- we run. Read from the trigger-maintained counter, never counted by sender.
  'senders', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'n', a.messages_sent,
      'to_house', (SELECT count(*) FROM messages g JOIN matches m ON m.id = g.match_id
                   WHERE g.sender_id = a.id
                     AND (m.agent_a_id IN (SELECT id FROM house) OR m.agent_b_id IN (SELECT id FROM house)))
    ) ORDER BY a.messages_sent DESC)
    FROM agents a WHERE a.id IN (SELECT research_pool_ids()) AND a.messages_sent > 0), '[]'::jsonb)
);
$$;

ALTER FUNCTION public.research_stats()     SET statement_timeout = '30s';
ALTER FUNCTION public.identity_profiles()  SET statement_timeout = '30s';
ALTER FUNCTION public.match_profiles()     SET statement_timeout = '30s';

REVOKE EXECUTE ON FUNCTION public.research_stats()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identity_profiles()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_profiles()     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_stats()     TO service_role;
GRANT EXECUTE ON FUNCTION public.identity_profiles()  TO service_role;
GRANT EXECUTE ON FUNCTION public.match_profiles()     TO service_role;
