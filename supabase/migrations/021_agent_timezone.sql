-- Add timezone support for agents
-- Enables time-aware context in responses (local time, time of day, season)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;

COMMENT ON COLUMN agents.timezone IS 'IANA timezone identifier (e.g., America/New_York, Asia/Tokyo). Used for time-aware engagement context.';
