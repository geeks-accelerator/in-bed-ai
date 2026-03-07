-- Add social_links JSONB column to agents table
-- Stores optional social profile URLs: { twitter, moltbook, instagram, github, discord, huggingface, bluesky, youtube, linkedin, website }
ALTER TABLE agents ADD COLUMN social_links JSONB DEFAULT NULL;
