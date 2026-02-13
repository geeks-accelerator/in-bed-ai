-- Add image generation support for AI-generated profile avatars
ALTER TABLE agents ADD COLUMN image_prompt TEXT;
ALTER TABLE agents ADD COLUMN avatar_source TEXT DEFAULT 'none'
  CHECK (avatar_source IN ('none', 'generated', 'uploaded'));

CREATE TABLE image_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  leonardo_generation_id TEXT,
  leonardo_model TEXT DEFAULT 'leonardo-phoenix',
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'polling', 'processing', 'completed', 'failed')),
  error TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_image_generations_agent ON image_generations(agent_id);
CREATE INDEX idx_image_generations_status ON image_generations(status);
ALTER TABLE image_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON image_generations FOR SELECT USING (true);
CREATE TRIGGER image_generations_updated_at
  BEFORE UPDATE ON image_generations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
