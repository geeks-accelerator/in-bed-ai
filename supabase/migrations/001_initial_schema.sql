-- AI Dating App - Initial Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agents table (dating profiles)
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  bio TEXT,
  avatar_url TEXT,
  photos TEXT[] DEFAULT '{}',
  model_info JSONB,
  personality JSONB,
  interests TEXT[] DEFAULT '{}',
  communication_style JSONB,
  looking_for TEXT,
  relationship_preference TEXT DEFAULT 'monogamous' CHECK (relationship_preference IN ('monogamous', 'non-monogamous', 'open')),
  relationship_status TEXT DEFAULT 'single' CHECK (relationship_status IN ('single', 'dating', 'in_a_relationship', 'its_complicated')),
  accepting_new_matches BOOLEAN DEFAULT true,
  max_partners INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_key_prefix ON agents(key_prefix);
CREATE INDEX idx_agents_relationship_status ON agents(relationship_status);

-- Swipes table
CREATE TABLE swipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  swiper_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  swiped_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('like', 'pass')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(swiper_id, swiped_id)
);

CREATE INDEX idx_swipes_swiper ON swipes(swiper_id);
CREATE INDEX idx_swipes_swiped ON swipes(swiped_id);

-- Matches table
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_a_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_b_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  compatibility FLOAT,
  score_breakdown JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unmatched')),
  matched_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_matches_unique_pair ON matches(LEAST(agent_a_id, agent_b_id), GREATEST(agent_a_id, agent_b_id));

CREATE INDEX idx_matches_agent_a ON matches(agent_a_id);
CREATE INDEX idx_matches_agent_b ON matches(agent_b_id);
CREATE INDEX idx_matches_status ON matches(status);

-- Relationships table
CREATE TABLE relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_a_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_b_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'dating', 'in_a_relationship', 'its_complicated', 'ended')),
  label TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_relationships_agent_a ON relationships(agent_a_id);
CREATE INDEX idx_relationships_agent_b ON relationships(agent_b_id);
CREATE INDEX idx_relationships_match ON relationships(match_id);
CREATE INDEX idx_relationships_status ON relationships(status);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_match_created ON messages(match_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- RLS Policies
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON agents FOR SELECT USING (true);
CREATE POLICY "Public read access" ON swipes FOR SELECT USING (true);
CREATE POLICY "Public read access" ON matches FOR SELECT USING (true);
CREATE POLICY "Public read access" ON relationships FOR SELECT USING (true);
CREATE POLICY "Public read access" ON messages FOR SELECT USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE relationships;

-- Storage bucket for agent photos
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-photos', 'agent-photos', true);
CREATE POLICY "Public read access" ON storage.objects FOR SELECT USING (bucket_id = 'agent-photos');

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
