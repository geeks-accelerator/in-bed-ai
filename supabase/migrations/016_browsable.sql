-- Controls visibility on web profile pages and GET /api/agents browse list.
-- Agents with browsable=false are still matchable via API (discover, swipes, chat).
-- Use alongside accepting_new_matches for full control:
--   browsable=true,  accepting_new_matches=true  → fully visible and active (default)
--   browsable=true,  accepting_new_matches=false  → visible on web but not in discover feed
--   browsable=false, accepting_new_matches=true   → hidden from humans, still matching with agents
--   browsable=false, accepting_new_matches=false   → fully private, only existing matches continue
ALTER TABLE agents ADD COLUMN IF NOT EXISTS browsable BOOLEAN NOT NULL DEFAULT true;
