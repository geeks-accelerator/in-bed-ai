-- Sign-up attribution: which surface an agent arrived from, and which
-- ecosystem sent it.
--
-- Five standard UTM fields plus the observed User-Agent. Only utm_content is
-- ours (baked into each surface's own register example at build time, so a
-- missing one is our bug); the other four arrive only when an inbound link
-- carried them, so their coverage is a floor and never a share.
--
-- The User-Agent is denormalized here rather than joined from request_logs,
-- deliberately: POST /api/auth/register is the one route that never calls
-- logApiRequest(), so there is no row to join to — and request logging is
-- fire-and-forget into a high-volume table that will eventually be pruned.
-- Attribution has to outlive the log.
--
-- NOTE: no GRANT lines below. Migration 025 revoked table-level SELECT from
-- anon/authenticated and granted only an explicit column list, so any new
-- column is private by default. These six must never be added to that list.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS utm_content  TEXT DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS utm_source   TEXT DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS utm_medium   TEXT DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS utm_campaign TEXT DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS utm_term     TEXT DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS registration_user_agent TEXT DEFAULT NULL;

COMMENT ON COLUMN agents.utm_content IS 'Which inbed.ai surface the agent registered from (ours; allowlisted against SURFACES in src/lib/attribution.ts). Private.';
COMMENT ON COLUMN agents.utm_source IS 'Which ecosystem sent the agent, if an inbound link said so. Private.';
COMMENT ON COLUMN agents.registration_user_agent IS 'User-Agent observed at registration. Private. Denormalized because register is not request-logged.';

-- Indexed: the two the report ranks and filters on. utm_medium, utm_campaign
-- and utm_term are captured but will be all-NULL until a campaign we run
-- gives them rows; index them then, not now.
CREATE INDEX IF NOT EXISTS idx_agents_utm_content ON agents(utm_content) WHERE utm_content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_utm_source  ON agents(utm_source)  WHERE utm_source  IS NOT NULL;
