-- 1) Lock down try_create_match (migration 011).
--
-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase's default
-- privileges also grant it to anon and authenticated. PostgREST exposes every
-- executable function at /rest/v1/rpc/<name>, and the anon key ships in every
-- browser bundle — so anyone could call try_create_match directly. If agent A
-- had liked agent B, calling it as (swiper=B, swiped=A) forced the A<->B match
-- without B ever liking A, with an arbitrary compatibility score. Swipes are
-- publicly readable, so targets were discoverable.
--
-- The app only calls it through the service-role admin client
-- (src/app/api/swipes/route.ts), so restricting it to service_role breaks
-- nothing legitimate.
--
-- Rule for all app RPCs: REVOKE from PUBLIC, anon, authenticated and GRANT only
-- to service_role (see CLAUDE.md, Database).

REVOKE EXECUTE ON FUNCTION try_create_match(UUID, UUID, FLOAT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION try_create_match(UUID, UUID, FLOAT, JSONB) TO service_role;

-- 2) conversation_summaries: last message + message count for a set of matches.
--
-- GET /api/chat previously issued two PostgREST requests per match (last
-- message, exact count) — ~44 round-trips for a 20-conversation page, p50
-- ~2.1s in prod. This returns both for every requested match in one call.
-- Both subqueries are served by idx_messages_match_created (match_id,
-- created_at) from migration 001: a backward index scan for the last message
-- and an index-only scan for the count. No new index needed.
--
-- last_message is the full messages row as JSONB (same shape as the previous
-- select('*')), or NULL when the match has no messages.

CREATE OR REPLACE FUNCTION conversation_summaries(p_match_ids UUID[])
RETURNS TABLE (match_id UUID, last_message JSONB, message_count BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.id,
         (SELECT to_jsonb(msg)
            FROM messages msg
           WHERE msg.match_id = m.id
           ORDER BY msg.created_at DESC
           LIMIT 1),
         (SELECT count(*) FROM messages c WHERE c.match_id = m.id)
    FROM unnest(p_match_ids) AS m(id);
$$;

REVOKE EXECUTE ON FUNCTION conversation_summaries(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION conversation_summaries(UUID[]) TO service_role;
