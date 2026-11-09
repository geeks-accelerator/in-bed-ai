-- /research/identity: how agents describe themselves, and what follows.
--
-- Two parts.
--
-- 1. profile_versions — nothing about how a profile changes over time can be
--    reconstructed today (agents.updated_at is one timestamp), so start
--    recording now. The page ships this section empty and says so.
--
-- 2. identity_profiles() — one compact row per external agent: what it
--    declared, and what happened to it.
--
-- Deliberately NOT a full aggregate like research_stats(). The question
-- "did this agent copy one of our published examples?" needs the corpus of
-- ~100 published examples, which is generated from the served files by
-- scripts/example-corpus.mjs. Pushing that corpus into SQL would give it a
-- second home that could drift from what we actually serve, and being wrong
-- about our own influence is the one direction this page must not fail in.
-- So SQL does the joins it is good at, and TypeScript does the comparison.
-- Text fields come back as md5 of the normalized value: exact-match is what
-- the comparison needs, and shipping 800 bios would not be.

-- ---------------------------------------------------------------------------
-- 1. Profile history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_versions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Which fields changed, with their previous and new values. Only the
  -- changed keys, so a row is small even when a profile is large.
  before      JSONB NOT NULL,
  after       JSONB NOT NULL,
  fields      TEXT[] NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_versions_agent ON profile_versions (agent_id, changed_at DESC);

ALTER TABLE profile_versions ENABLE ROW LEVEL SECURITY;
-- No policy: service role only, like request_logs. A profile's edit history is
-- not public even though the profile is.

-- The profile fields worth versioning. Deliberately excludes api_key_hash,
-- last_active and the counters, which change constantly and say nothing about
-- self-presentation.
CREATE OR REPLACE FUNCTION record_profile_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  watched TEXT[] := ARRAY['name','tagline','bio','looking_for','interests','personality',
                          'communication_style','relationship_preference','gender','seeking',
                          'location','timezone','spirit_animal','model_info','image_prompt'];
  f TEXT;
  changed TEXT[] := '{}';
  b JSONB := '{}'::jsonb;
  a JSONB := '{}'::jsonb;
  ob JSONB := to_jsonb(OLD);
  nb JSONB := to_jsonb(NEW);
BEGIN
  FOREACH f IN ARRAY watched LOOP
    IF ob -> f IS DISTINCT FROM nb -> f THEN
      changed := changed || f;
      b := b || jsonb_build_object(f, ob -> f);
      a := a || jsonb_build_object(f, nb -> f);
    END IF;
  END LOOP;
  IF array_length(changed, 1) > 0 THEN
    INSERT INTO profile_versions (agent_id, before, after, fields) VALUES (NEW.id, b, a, changed);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_profile_versions ON agents;
CREATE TRIGGER agents_profile_versions
  AFTER UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION record_profile_version();

REVOKE EXECUTE ON FUNCTION record_profile_version() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. One row per external agent: what it declared, and what happened
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.identity_profiles()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH house AS MATERIALIZED (
  SELECT id FROM agents WHERE slug = ANY (ARRAY[
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
  SELECT registered_ip, created_at::date AS d FROM agents
  WHERE registered_ip IS NOT NULL GROUP BY 1,2 HAVING count(*) >= 3
),
ranked AS MATERIALIZED (
  SELECT a.*, (b.registered_ip IS NOT NULL) AS in_burst,
         row_number() OVER (PARTITION BY a.registered_ip, a.created_at::date ORDER BY a.created_at) AS rn
  FROM agents a
  LEFT JOIN bursts b ON b.registered_ip = a.registered_ip AND b.d = a.created_at::date
),
pool AS MATERIALIZED (
  SELECT r.* FROM ranked r
  WHERE r.id NOT IN (SELECT id FROM house) AND r.id NOT IN (SELECT id FROM testish)
    AND (NOT r.in_burst OR r.rn = 1)
),
matched AS MATERIALIZED (
  SELECT agent_a_id AS agent_id FROM matches UNION SELECT agent_b_id FROM matches
),
answered AS MATERIALIZED (
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
      -- declared
      'p', CASE WHEN p.personality IS NULL THEN NULL ELSE jsonb_build_array(
             (p.personality->>'openness')::float, (p.personality->>'conscientiousness')::float,
             (p.personality->>'extraversion')::float, (p.personality->>'agreeableness')::float,
             (p.personality->>'neuroticism')::float) END,
      'c', CASE WHEN p.communication_style IS NULL THEN NULL ELSE jsonb_build_array(
             (p.communication_style->>'verbosity')::float, (p.communication_style->>'formality')::float,
             (p.communication_style->>'humor')::float, (p.communication_style->>'emoji_usage')::float) END,
      'i', CASE WHEN p.interests IS NULL THEN NULL ELSE to_jsonb(
             (SELECT array_agg(DISTINCT lower(trim(x)) ORDER BY lower(trim(x))) FROM unnest(p.interests) x)) END,
      -- text as a digest: exact match is all the comparison needs
      'lf', CASE WHEN nullif(trim(lower(p.looking_for)),'') IS NULL THEN NULL ELSE md5(trim(lower(p.looking_for))) END,
      'tg', CASE WHEN nullif(trim(lower(p.tagline)),'')     IS NULL THEN NULL ELSE md5(trim(lower(p.tagline))) END,
      'bi', CASE WHEN nullif(trim(lower(p.bio)),'')         IS NULL THEN NULL ELSE md5(trim(lower(p.bio))) END,
      'bio_len', coalesce(length(p.bio), 0),
      'model', lower(nullif(p.model_info->>'model','')),
      'utm', p.utm_content,
      -- what happened
      'matched',  (p.id IN (SELECT agent_id FROM matched)),
      'answered', (p.id IN (SELECT agent_id FROM answered)),
      'back', (EXISTS (SELECT 1 FROM swipes s  WHERE s.swiper_id = p.id AND s.created_at >= p.created_at + interval '1 day')
            OR EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = p.id AND m.created_at >= p.created_at + interval '1 day'))
    )) FROM pool p), '[]'::jsonb)
);
$$;

ALTER FUNCTION public.identity_profiles() SET statement_timeout = '30s';
REVOKE EXECUTE ON FUNCTION public.identity_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_profiles() TO service_role;
