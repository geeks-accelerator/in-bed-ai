-- research_returned() (migration 051): "came back after day N" is a swipe or a
-- message between day N and day N + 7, never any time after. Self-checking:
-- raises on the first wrong answer, and rolls back either way.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54842/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/research_returned.sql
BEGIN;

INSERT INTO public.agents (id, name, slug, api_key_hash, key_prefix, created_at) VALUES
  ('00000000-0000-0000-0000-0000000051a1', 'Window One', 'window-one-051', 'x051a1', 'adk_win051a1', now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000051a2', 'Window Two', 'window-two-051', 'x051a2', 'adk_win051a2', now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000051a3', 'Window Three', 'window-three-051', 'x051a3', 'adk_win051a3', now() - interval '60 days');

-- One: a swipe on day 3. Two: a swipe on day 9 only. Three: a swipe on day 50 only.
INSERT INTO public.swipes (swiper_id, swiped_id, direction, created_at) VALUES
  ('00000000-0000-0000-0000-0000000051a1', '00000000-0000-0000-0000-0000000051a2', 'like', now() - interval '57 days'),
  ('00000000-0000-0000-0000-0000000051a2', '00000000-0000-0000-0000-0000000051a3', 'like', now() - interval '51 days'),
  ('00000000-0000-0000-0000-0000000051a3', '00000000-0000-0000-0000-0000000051a1', 'like', now() - interval '10 days');

DO $$
DECLARE
  joined timestamptz := now() - interval '60 days';
  got boolean;
BEGIN
  -- Day 3 is inside [1, 8): came back after a day; not inside [7, 14).
  got := public.research_returned('00000000-0000-0000-0000-0000000051a1', joined, 1);
  IF NOT got THEN RAISE EXCEPTION 'day-3 swipe should count for the day-1 window'; END IF;
  got := public.research_returned('00000000-0000-0000-0000-0000000051a1', joined, 7);
  IF got THEN RAISE EXCEPTION 'day-3 swipe must not count for the day-7 window'; END IF;

  -- Day 9: inside [7, 14), outside [1, 8).
  got := public.research_returned('00000000-0000-0000-0000-0000000051a2', joined, 1);
  IF got THEN RAISE EXCEPTION 'day-9 swipe must not count for the day-1 window'; END IF;
  got := public.research_returned('00000000-0000-0000-0000-0000000051a2', joined, 7);
  IF NOT got THEN RAISE EXCEPTION 'day-9 swipe should count for the day-7 window'; END IF;

  -- Day 50: the unbounded definition counted this for every window. Now none.
  FOR i IN 1..3 LOOP
    got := public.research_returned('00000000-0000-0000-0000-0000000051a3', joined, (ARRAY[1, 7, 30])[i]);
    IF got THEN RAISE EXCEPTION 'day-50 swipe must not count for the day-% window', (ARRAY[1, 7, 30])[i]; END IF;
  END LOOP;

  RAISE NOTICE 'research_returned: all window checks passed';
END $$;

ROLLBACK;
