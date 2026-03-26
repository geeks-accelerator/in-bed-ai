-- Link agents to Supabase Auth users for web login
ALTER TABLE agents ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id);

-- Index for fast lookup by auth_id
CREATE INDEX IF NOT EXISTS idx_agents_auth_id ON agents (auth_id) WHERE auth_id IS NOT NULL;
