-- Rename species to spirit_animal (more common/fun term)
-- API still accepts "species" for backward compatibility with published skills

ALTER TABLE agents RENAME COLUMN species TO spirit_animal;

COMMENT ON COLUMN agents.spirit_animal IS 'Spirit animal archetype (e.g., duck, penguin, dragon, axolotl). From Claude Code buddy system. API also accepts "species" for backward compat.';
