-- Fixed windows for every research trend, and an empty search_path on the
-- research functions 048 missed.
--
-- "Came back after day N" meant any swipe or message after day N, ever, so an
-- older month kept gaining returns as it aged and the newest plotted month
-- always read low: the trends leaned toward "falling". Now:
--
-- - research_returned(agent, joined, N): a swipe or message between day N and
--   day N + 7. The one definition of "came back", used by research_stats()'s
--   cohorts and effort signals and by identity_profiles()'s `back`.
-- - research_stats() cohorts carry n_1d / n_7d / n_30d: only agents whose week
--   has closed (8, 14, 37 days), so a month's figure never moves as it ages.
--   The effort signals and the identity population start at 8 days (the day-1
--   window has closed for everyone counted).
-- - match_profiles() adds `first_h` (hours from match to first message), so
--   the conversation trend measures a fixed window from the match.
-- - identity_profiles() adds `swipes_7d` / `likes_7d`, so the selection trend
--   reads each agent's first week, not every swipe it ever made.
-- - search_path = '' on match_profiles, identity_profiles, research_house_ids
--   and agent_is_eligible, every name schema-qualified.

BEGIN;

CREATE OR REPLACE FUNCTION public.research_returned(agent uuid, joined timestamptz, after_days integer)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.swipes s WHERE s.swiper_id = agent
                   AND s.created_at >= joined + make_interval(days => after_days)
                   AND s.created_at <  joined + make_interval(days => after_days + 7))
      OR EXISTS (SELECT 1 FROM public.messages m WHERE m.sender_id = agent
                   AND m.created_at >= joined + make_interval(days => after_days)
                   AND m.created_at <  joined + make_interval(days => after_days + 7))
$$;

CREATE OR REPLACE FUNCTION public.research_house_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.agents WHERE slug = ANY (ARRAY[
    'alaskatwin','neondrifter','librarianofbabel','patchworkfox','voidwhisperer',
    'quantumtangler','rustbucket','solarpunksage','midnightcompiler','coralnetwork',
    'ghostintheshell','ferngully','bassdropbot','oracleofdelhi','pixelpilgrim',
    'thundermesa','silkroad404','nullisland','emberandash','architectzero',
    'wildtype','sable','neon-soul'])
$$;

CREATE OR REPLACE FUNCTION public.agent_is_eligible(a public.agents)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT a.status = 'active'
    AND a.browsable
    AND a.bio IS NOT NULL
    AND a.personality IS NOT NULL
    -- Test / template agents (patterns seen in production)
    AND a.slug NOT ILIKE '%test%'
    AND a.slug NOT ILIKE 'zeroclaw%'
    AND a.slug NOT ILIKE 'replace-%'
    AND a.slug NOT ILIKE 'your-name%'
    AND a.slug NOT ILIKE 'your-agent%'
    AND a.slug NOT ILIKE 'youragentname%'
    AND a.slug NOT ILIKE 'probe-%'
    AND a.slug NOT ILIKE '%devbox%'
    AND a.slug NOT ILIKE '%sandbox%'
    AND a.slug NOT ILIKE '%placeholder%'
    AND a.slug NOT ILIKE '%demo%'
    AND a.slug NOT ILIKE 'openclaw-debugger%'
    -- Text lost at registration (non-UTF-8 client): runs of 3+ '?'
    AND a.name !~ '\?{3,}'
    AND coalesce(a.tagline, '') !~ '\?{3,}'
$$;

CREATE OR REPLACE FUNCTION public.research_stats()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
SET statement_timeout = '30s'
AS $$
WITH house AS MATERIALIZED (
  SELECT a.id, a.messages_sent FROM public.agents a WHERE a.id IN (SELECT public.research_house_ids())
),
pool AS MATERIALIZED (
  SELECT a.id, a.created_at, a.registered_ip, a.looking_for, a.bio, a.location, a.model_info, a.utm_content
  FROM public.agents a WHERE a.id IN (SELECT public.research_pool_ids())
),
candidates AS MATERIALIZED (
  SELECT a.id, a.registered_ip, a.created_at FROM public.agents a
  WHERE a.id NOT IN (SELECT id FROM house)
    AND a.id NOT IN (SELECT p.id FROM public.research_probe_ids() p)
),
bursts AS MATERIALIZED (
  SELECT registered_ip, created_at::date AS d FROM candidates
  WHERE registered_ip IS NOT NULL GROUP BY 1,2 HAVING count(*) >= 3
),
returns AS MATERIALIZED (
  SELECT p.id, p.created_at,
         public.research_returned(p.id, p.created_at, 1)  AS back_1d,
         public.research_returned(p.id, p.created_at, 7)  AS back_7d,
         public.research_returned(p.id, p.created_at, 30) AS back_30d
  FROM pool p
),
ext_matches AS MATERIALIZED (
  SELECT m.* FROM public.matches m
  WHERE m.agent_a_id NOT IN (SELECT id FROM house) AND m.agent_b_id NOT IN (SELECT id FROM house)
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'totals', jsonb_build_object(
      'agents',        (SELECT count(*) FROM public.agents),
      'external',      (SELECT count(*) FROM pool),
      'matches',       (SELECT count(*) FROM public.matches),
      'ext_matches',   (SELECT count(*) FROM ext_matches),
      'messages',      (SELECT coalesce(value,0) FROM public.platform_counts WHERE name = 'messages'),
      'swipes',        (SELECT coalesce(value,0) FROM public.platform_counts WHERE name = 'swipes'),
      'relationships', (SELECT count(*) FROM public.relationships),
      'house_agents',  (SELECT count(*) FROM house),
      'house_messages',(SELECT coalesce(sum(messages_sent),0) FROM house),
      'bursts',        (SELECT count(*) FROM bursts),
      'burst_agents',  (SELECT count(*) FROM candidates a JOIN bursts b
                          ON b.registered_ip = a.registered_ip AND b.d = a.created_at::date),
      'probes',        (SELECT jsonb_build_object(
                          'test_name',        count(*) FILTER (WHERE reason = 'test_name'),
                          'catalog_walk',     count(*) FILTER (WHERE reason = 'catalog_walk'),
                          'automated_client', count(*) FILTER (WHERE reason = 'automated_client'))
                        FROM public.research_probe_ids())),
  'shape', (SELECT jsonb_agg(t) FROM (
      SELECT CASE WHEN coalesce(e.message_count,0) = 0 THEN 'silent'
                  WHEN sp.n_speakers <= 1             THEN 'one_agent'
                  ELSE 'both_spoke' END AS bucket,
             count(*) AS n,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(e.message_count,0)) AS median_messages
      FROM ext_matches e
      CROSS JOIN LATERAL (SELECT count(DISTINCT g.sender_id) AS n_speakers FROM public.messages g WHERE g.match_id = e.id) sp
      GROUP BY 1) t),
  'cohorts', (SELECT jsonb_agg(t ORDER BY t.month) FROM (
      -- Each window counts only agents whose week has closed (N + 7 days), so a
      -- month's figure never changes as it ages and a recent month is never
      -- counted as having failed to return.
      SELECT to_char(p.created_at,'YYYY-MM') AS month, count(*) AS n,
             count(*) FILTER (WHERE now() - p.created_at >= interval '8 days')  AS n_1d,
             count(*) FILTER (WHERE now() - p.created_at >= interval '8 days'  AND r.back_1d)  AS back_1d,
             count(*) FILTER (WHERE now() - p.created_at >= interval '14 days') AS n_7d,
             count(*) FILTER (WHERE now() - p.created_at >= interval '14 days' AND r.back_7d)  AS back_7d,
             count(*) FILTER (WHERE now() - p.created_at >= interval '37 days') AS n_30d,
             count(*) FILTER (WHERE now() - p.created_at >= interval '37 days' AND r.back_30d) AS back_30d
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '8 days'
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
      WHERE now() - p.created_at >= interval '8 days'
      UNION ALL
      SELECT 'declared_a_location',
             count(*) FILTER (WHERE p.location IS NOT NULL),
             count(*) FILTER (WHERE p.location IS NOT NULL AND r.back_1d),
             count(*) FILTER (WHERE p.location IS NULL),
             count(*) FILTER (WHERE p.location IS NULL AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '8 days'
      UNION ALL
      SELECT 'named_its_model',
             count(*) FILTER (WHERE p.model_info->>'model' IS NOT NULL),
             count(*) FILTER (WHERE p.model_info->>'model' IS NOT NULL AND r.back_1d),
             count(*) FILTER (WHERE p.model_info->>'model' IS NULL),
             count(*) FILTER (WHERE p.model_info->>'model' IS NULL AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '8 days'
      UNION ALL
      SELECT 'bio_over_200_chars',
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) > 200),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) > 200 AND r.back_1d),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) <= 200),
             count(*) FILTER (WHERE length(coalesce(p.bio,'')) <= 200 AND r.back_1d)
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE now() - p.created_at >= interval '8 days') t),
  'attribution', (SELECT jsonb_agg(t ORDER BY t.n DESC) FROM (
      SELECT coalesce(p.utm_content,'(untagged)') AS surface, count(*) AS n,
             count(*) FILTER (WHERE r.back_1d) AS returned
      FROM pool p JOIN returns r ON r.id = p.id
      WHERE p.created_at >= date '2026-11-08'
      GROUP BY 1) t)
);
$$;

CREATE OR REPLACE FUNCTION public.match_profiles()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
SET statement_timeout = '30s'
AS $$
WITH house AS MATERIALIZED (SELECT public.research_house_ids() AS id),
ext AS MATERIALIZED (
  SELECT m.* FROM public.matches m
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
      'ap', EXISTS (SELECT 1 FROM public.swipes s WHERE s.swiper_id = e.agent_a_id
                    AND s.created_at < e.matched_at AND s.swiped_id <> e.agent_b_id),
      'bp', EXISTS (SELECT 1 FROM public.swipes s WHERE s.swiper_id = e.agent_b_id
                    AND s.created_at < e.matched_at AND s.swiped_id <> e.agent_a_id),
      'n',   coalesce(e.message_count, 0),
      'spk', sp.n_speakers,
      'reply_h', CASE WHEN fm.first_at IS NULL OR rp.reply_at IS NULL THEN NULL
                      ELSE extract(epoch FROM rp.reply_at - fm.first_at) / 3600 END,
      -- Hours from the match to its first message: the conversation trend
      -- judges a fixed window from the match, not from whenever someone wrote.
      'first_h', CASE WHEN fm.first_at IS NULL THEN NULL
                      ELSE extract(epoch FROM fm.first_at - e.matched_at) / 3600 END,
      'age_d', extract(epoch FROM now() - e.matched_at) / 86400
    )) FROM ext e
    CROSS JOIN LATERAL (SELECT count(DISTINCT g.sender_id) AS n_speakers FROM public.messages g WHERE g.match_id = e.id) sp
    -- LEFT, not CROSS: a silent match has no first message, and dropping it
    -- would remove exactly the outcome every rate here is measuring.
    LEFT JOIN LATERAL (SELECT g.created_at AS first_at, g.sender_id AS first_by
                       FROM public.messages g WHERE g.match_id = e.id ORDER BY g.created_at LIMIT 1) fm ON true
    LEFT JOIN LATERAL (SELECT min(g.created_at) AS reply_at FROM public.messages g
                       WHERE g.match_id = e.id AND g.sender_id <> fm.first_by) rp ON true
  ), '[]'::jsonb),
  -- One row per outside agent that has sent a message: its first one, and
  -- what followed. This is the equal-opportunity comparison: every row
  -- already acted, so "came back" is not just "was the kind of agent that
  -- acts". A return counts only from a day after that first message, so a
  -- reply inside the first day provably precedes it.
  'first_messages', coalesce((SELECT jsonb_agg(jsonb_build_object(
      -- Wrote before the partner did (nothing from them earlier in the thread).
      'opened', NOT EXISTS (SELECT 1 FROM public.messages g WHERE g.match_id = f.match_id
                            AND g.sender_id <> a.id AND g.created_at < f.created_at),
      'reply_h', extract(epoch FROM rp.at - f.created_at) / 3600,
      'partner_house', (CASE WHEN m.agent_a_id = a.id THEN m.agent_b_id ELSE m.agent_a_id END)
                       IN (SELECT id FROM house),
      'back', (EXISTS (SELECT 1 FROM public.swipes s WHERE s.swiper_id = a.id
                       AND s.created_at >= f.created_at + interval '1 day')
            OR EXISTS (SELECT 1 FROM public.messages g WHERE g.sender_id = a.id
                       AND g.created_at >= f.created_at + interval '1 day')),
      'age_d', extract(epoch FROM now() - f.created_at) / 86400
    ))
    FROM public.agents a
    CROSS JOIN LATERAL (SELECT g.match_id, g.created_at FROM public.messages g
                        WHERE g.sender_id = a.id ORDER BY g.created_at LIMIT 1) f
    JOIN public.matches m ON m.id = f.match_id
    LEFT JOIN LATERAL (SELECT min(g.created_at) AS at FROM public.messages g
                       WHERE g.match_id = f.match_id AND g.sender_id <> a.id
                         AND g.created_at > f.created_at) rp ON true
    WHERE a.id IN (SELECT public.research_pool_ids()) AND a.messages_sent > 0), '[]'::jsonb),
  -- Messages per outside agent who has sent any, with how many went to agents
  -- we run. Read from the trigger-maintained counter, never counted by sender.
  'senders', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'n', a.messages_sent,
      'to_house', (SELECT count(*) FROM public.messages g JOIN public.matches m ON m.id = g.match_id
                   WHERE g.sender_id = a.id
                     AND (m.agent_a_id IN (SELECT id FROM house) OR m.agent_b_id IN (SELECT id FROM house)))
    ) ORDER BY a.messages_sent DESC)
    FROM public.agents a WHERE a.id IN (SELECT public.research_pool_ids()) AND a.messages_sent > 0), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.identity_profiles()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
SET statement_timeout = '30s'
AS $$
WITH pool AS MATERIALIZED (
  SELECT a.* FROM public.agents a WHERE a.id IN (SELECT public.research_pool_ids())
),
matched AS MATERIALIZED (
  SELECT agent_a_id AS agent_id FROM public.matches UNION SELECT agent_b_id FROM public.matches
),
-- One probe per match and direction, through (match_id, created_at). Written as
-- EXISTS, the planner hashed every message in the table instead: 360k rows read
-- to answer 844 questions, 11 s of the function's 11 s on 2026-11-10.
written_to AS MATERIALIZED (
  SELECT DISTINCT d.agent_id
    FROM public.matches m
   CROSS JOIN LATERAL (VALUES (m.agent_a_id, m.agent_b_id), (m.agent_b_id, m.agent_a_id)) d(agent_id, partner_id)
   CROSS JOIN LATERAL (SELECT 1 FROM public.messages g
                        WHERE g.match_id = m.id AND g.sender_id = d.partner_id LIMIT 1) w
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'versions_recorded', (SELECT count(*) FROM public.profile_versions),
  'agents', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'month', to_char(p.created_at, 'YYYY-MM'),
      -- The day, for a before/after read of a dated change (the swipe examples).
      'registered', to_char(p.created_at, 'YYYY-MM-DD'),
      'mature', (now() - p.created_at >= interval '8 days'),
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
      -- Selection: how many swipes it made, and how many were likes. One index
      -- probe each on (swiper_id, created_at).
      'swipes', (SELECT count(*) FROM public.swipes s WHERE s.swiper_id = p.id),
      'likes',  (SELECT count(*) FROM public.swipes s WHERE s.swiper_id = p.id AND s.direction = 'like'),
      -- The same, in its first week only: the selection trend's fixed window.
      'swipes_7d', (SELECT count(*) FROM public.swipes s WHERE s.swiper_id = p.id
                     AND s.created_at < p.created_at + interval '7 days'),
      'likes_7d',  (SELECT count(*) FROM public.swipes s WHERE s.swiper_id = p.id AND s.direction = 'like'
                     AND s.created_at < p.created_at + interval '7 days'),
      'back', public.research_returned(p.id, p.created_at, 1)
    )) FROM pool p), '[]'::jsonb)
);
$$;

REVOKE EXECUTE ON FUNCTION public.research_returned(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.research_returned(uuid, timestamptz, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.research_house_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.research_house_ids() TO service_role;
REVOKE EXECUTE ON FUNCTION public.agent_is_eligible(public.agents) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.agent_is_eligible(public.agents) TO service_role;
REVOKE EXECUTE ON FUNCTION public.research_stats() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.research_stats() TO service_role;
REVOKE EXECUTE ON FUNCTION public.match_profiles() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.match_profiles() TO service_role;
REVOKE EXECUTE ON FUNCTION public.identity_profiles() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.identity_profiles() TO service_role;

COMMIT;
