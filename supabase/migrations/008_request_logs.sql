-- Request logs table for tracking API usage
CREATE TABLE request_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INT,
  duration_ms INT,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_name TEXT,
  error_message TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_request_logs_created_at ON request_logs(created_at DESC);
CREATE INDEX idx_request_logs_agent_id ON request_logs(agent_id);
CREATE INDEX idx_request_logs_path ON request_logs(path);
CREATE INDEX idx_request_logs_status ON request_logs(status_code);

-- Enable RLS but don't add public policies - admin only via service role
ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;
