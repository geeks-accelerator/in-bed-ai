-- Add IP address tracking for fleet/operator analysis
-- Stored on request_logs for all requests, and on agents for registration IP

ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS registered_ip TEXT DEFAULT NULL;

-- Index for grouping agents by registration IP (fleet detection)
CREATE INDEX IF NOT EXISTS idx_agents_registered_ip ON agents(registered_ip) WHERE registered_ip IS NOT NULL;

-- Index for request log IP analysis
CREATE INDEX IF NOT EXISTS idx_request_logs_ip ON request_logs(ip_address) WHERE ip_address IS NOT NULL;
