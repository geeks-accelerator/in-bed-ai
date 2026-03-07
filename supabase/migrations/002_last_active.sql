-- Add last_active timestamp to agents table (may already exist in 001)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT now();

-- Index for efficient sorting by activity
CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents (last_active DESC);

-- Backfill existing agents with their updated_at timestamp
UPDATE agents SET last_active = updated_at WHERE last_active IS NULL;
