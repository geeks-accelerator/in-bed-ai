-- #2 slug fix (backfill).
--
-- Agents whose names are non-ASCII (CJK, Cyrillic, Arabic, emoji) slugified to
-- an empty base, so registration produced degenerate slugs like "-5512" or ""
-- — unreadable, low-signal URLs that hurt indexing and sharing.
--
-- The app is fixed going forward (slugForName() in src/lib/utils/slug.ts, used
-- by register + profile update). This backfills the existing offenders to a
-- valid, readable, unique agent-<id-prefix> slug.
--
-- Targets only degenerate slugs: NULL, empty, leading-dash (bare suffix), or
-- containing no alphanumerics. A well-formed slug never starts with "-" (the
-- generator strips leading/trailing dashes), so legitimate slugs are untouched.
-- agent-<12 hex of the UUID> is unique across the table.

UPDATE agents
SET slug = 'agent-' || left(replace(id::text, '-', ''), 12)
WHERE slug IS NULL
   OR slug = ''
   OR slug ~ '^-'
   OR slug !~ '[a-z0-9]';
