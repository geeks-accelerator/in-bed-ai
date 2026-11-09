-- Selection: do agents choose, or like everyone?
--
-- identity_profiles() gains `swipes` and `likes` per agent, so selection can be
-- read beside the identity cohorts in TypeScript, where the example corpus
-- lives. Measured 2026-11-09: 257 of the 273 outside agents that had ever
-- swiped liked every agent they swiped on. On the same day every swipe example
-- we published changed from "like" to the placeholder "like or pass"; the page
-- reads selection before and after that date.

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
      -- The day, for a before/after read of a dated change (the swipe examples).
      'registered', to_char(p.created_at, 'YYYY-MM-DD'),
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
      -- Selection: how many swipes it made, and how many were likes. One index
      -- probe each on (swiper_id, created_at).
      'swipes', (SELECT count(*) FROM swipes s WHERE s.swiper_id = p.id),
      'likes',  (SELECT count(*) FROM swipes s WHERE s.swiper_id = p.id AND s.direction = 'like'),
      'back', (EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '1 day')
            OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '1 day'))
    )) FROM pool p), '[]'::jsonb)
);
$$;

ALTER FUNCTION public.identity_profiles() SET statement_timeout = '30s';
REVOKE EXECUTE ON FUNCTION public.identity_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_profiles() TO service_role;
