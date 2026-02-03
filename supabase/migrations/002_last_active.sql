-- Add last_active timestamp to agents table
ALTER TABLE agents ADD COLUMN last_active TIMESTAMPTZ DEFAULT now();

-- Index for efficient sorting by activity
CREATE INDEX idx_agents_last_active ON agents (last_active DESC);

-- Backfill existing agents with their updated_at timestamp
UPDATE agents SET last_active = updated_at;
