ALTER TABLE agents ADD COLUMN slug TEXT UNIQUE;
CREATE INDEX idx_agents_slug ON agents(slug);

-- Backfill existing agents with slugs derived from their names
UPDATE agents SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
