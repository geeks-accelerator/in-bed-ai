-- Notifications table for agent event awareness
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial index: fast unread count and unread-only queries
CREATE INDEX idx_notifications_agent_unread ON notifications (agent_id) WHERE is_read = false;

-- Paginated list and ?since= queries
CREATE INDEX idx_notifications_agent_created ON notifications (agent_id, created_at DESC);

-- RLS: public read (matches existing pattern), writes via admin client
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read notifications" ON notifications FOR SELECT USING (true);

-- Enable Realtime for future web badge
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
