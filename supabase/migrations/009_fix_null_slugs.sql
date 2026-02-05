-- Fix agents with null slugs by generating unique slugs from their names
-- This handles cases where the original backfill failed due to duplicate names

-- First, update agents with null slugs using name + random suffix
UPDATE agents
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
        || '-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL;

-- Handle any remaining edge cases (empty names, etc.) by using just the UUID prefix
UPDATE agents
SET slug = 'agent-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL OR slug = '';

-- Make slug NOT NULL going forward
ALTER TABLE agents ALTER COLUMN slug SET NOT NULL;
