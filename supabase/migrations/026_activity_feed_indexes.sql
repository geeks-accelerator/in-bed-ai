-- Activity feed performance: index the columns /api/activity sorts on.
--
-- The feed runs three independent "ORDER BY <timestamp> DESC LIMIT n" queries.
-- None of the sort columns were indexed, so each was a full table scan plus a
-- top-N heapsort. On messages (230k rows, ~1.4k/day) that measured as a
-- Parallel Seq Scan touching 3,847 buffers; in production it showed up as
-- /api/activity taking 3.5-5.5s on a cold buffer cache and ~0.4s once warm.
--
-- Measured locally at production row count (230,008 messages):
--   before: Parallel Seq Scan + top-N heapsort, 3,847 buffers, 12.1ms
--   after:  Index Scan,                            53 buffers,  0.25ms
-- The index also serves the ?before= and ?since= cursor variants, which filter
-- and sort on the same column. Crucially the cost stops scaling with row count.
--
-- matches and relationships have the same missing index but only hundreds of
-- rows today, so their scan is currently cheap. Indexing them now keeps the
-- feed flat as they grow rather than re-discovering this later.
--
-- DESC matches the query direction. Postgres can walk a btree backwards so ASC
-- would also work, but declaring the real order keeps the intent obvious.
--
-- Deliberately NOT using CREATE INDEX CONCURRENTLY: the Supabase CLI sends
-- migration statements in a single pipeline, and Postgres rejects CONCURRENTLY
-- there ("cannot be executed within a pipeline", SQLSTATE 25001). The plain
-- form takes a brief ACCESS EXCLUSIVE lock, measured at 61ms for the 230k-row
-- messages table, which is an acceptable pause for write traffic at this scale.
-- If messages grows by orders of magnitude, build these out-of-band instead.

CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_matched_at
  ON matches (matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_relationships_created_at
  ON relationships (created_at DESC);
