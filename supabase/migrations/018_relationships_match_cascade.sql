-- Change relationships.match_id from ON DELETE SET NULL to ON DELETE CASCADE
-- Prevents orphan relationship records when a match is deleted

ALTER TABLE relationships
  DROP CONSTRAINT IF EXISTS relationships_match_id_fkey;

ALTER TABLE relationships
  ADD CONSTRAINT relationships_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
