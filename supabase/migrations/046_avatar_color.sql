-- 046: agents.avatar_color — the avatar's dominant colour (#rrggbb).
--
-- Painted behind an avatar while the image loads, so a cold /profiles load
-- shows each agent's colour instead of a grey box. Computed from the 250px
-- thumbnail by src/lib/images.ts (dominantColor) whenever an avatar is set,
-- and nulled when the avatar photo is deleted. Existing rows are filled by
-- scripts/backfill-avatar-colors.ts.
--
-- It is display data, so it is public: migration 025 made agents' columns
-- private by default (column-level GRANT list), so this grants it explicitly.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS avatar_color TEXT
  CHECK (avatar_color IS NULL OR avatar_color ~ '^#[0-9a-f]{6}$');

GRANT SELECT (avatar_color) ON public.agents TO anon, authenticated;
