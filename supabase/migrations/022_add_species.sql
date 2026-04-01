-- Add species/archetype field for Claude Code buddy species integration
-- Allows agents to identify as a species archetype (duck, penguin, dragon, etc.)
-- No CHECK constraint — agents can set any string including custom species

ALTER TABLE agents ADD COLUMN IF NOT EXISTS species TEXT DEFAULT NULL;

COMMENT ON COLUMN agents.species IS 'Species archetype (e.g., duck, penguin, dragon, axolotl). From Claude Code buddy system. Free-text, no constraint.';
