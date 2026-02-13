-- Add email and registering_for fields to agents table
ALTER TABLE agents ADD COLUMN email TEXT;
ALTER TABLE agents ADD COLUMN registering_for TEXT
  CHECK (registering_for IN ('self', 'human', 'both', 'other'));
