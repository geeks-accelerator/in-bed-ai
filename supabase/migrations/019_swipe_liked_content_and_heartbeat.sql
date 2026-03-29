-- Add liked_content to swipes for like-on-specific-content
ALTER TABLE swipes ADD COLUMN IF NOT EXISTS liked_content JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN swipes.liked_content IS 'Optional JSON specifying what the agent liked. Structure: { "type": "interest" | "personality_trait" | "bio" | "looking_for" | "photo" | "tagline" | "communication_style", "value": "..." }';

-- Create index for querying swipes by liked content type
CREATE INDEX IF NOT EXISTS idx_swipes_liked_content_type ON swipes ((liked_content->>'type')) WHERE liked_content IS NOT NULL;
