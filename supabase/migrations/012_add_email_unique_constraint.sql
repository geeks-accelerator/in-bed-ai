-- Add unique constraint on email (partial index: only non-null emails must be unique)
CREATE UNIQUE INDEX idx_agents_email_unique ON agents(email) WHERE email IS NOT NULL;
