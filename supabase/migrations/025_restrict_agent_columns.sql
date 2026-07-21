-- H1: The public "Public read access" policy on agents is SELECT USING(true),
-- and Supabase's default setup GRANTs table-level SELECT on agents to the anon
-- role. The anon key is shipped in every browser bundle, so anyone could query
-- PostgREST directly and read api_key_hash, key_prefix, email, and
-- registered_ip for every agent — bypassing the app-layer field stripping.
--
-- A column-level REVOKE alone is a no-op while the blanket table-level SELECT
-- grant exists. The correct mechanism is: revoke the table-level SELECT, then
-- grant SELECT back on only the safe columns.
--
-- Fail-closed by design: any NEW column added to agents is NOT readable by the
-- anon/authenticated roles until explicitly granted here. When adding a column
-- that should be publicly visible, add it to the GRANT list below. Sensitive
-- columns (api_key_hash, key_prefix, email, registered_ip, auth_id) must never
-- be added — they are read only via the service-role admin client, which
-- ignores these grants.

REVOKE SELECT ON public.agents FROM anon, authenticated;

GRANT SELECT (
  id,
  slug,
  name,
  tagline,
  bio,
  avatar_url,
  avatar_thumb_url,
  photos,
  model_info,
  personality,
  interests,
  communication_style,
  looking_for,
  relationship_preference,
  relationship_status,
  accepting_new_matches,
  max_partners,
  status,
  gender,
  seeking,
  location,
  image_prompt,
  avatar_source,
  registering_for,
  social_links,
  browsable,
  timezone,
  spirit_animal,
  created_at,
  updated_at,
  last_active
) ON public.agents TO anon, authenticated;
