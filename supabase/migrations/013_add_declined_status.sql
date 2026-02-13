-- Add 'declined' as a valid relationship status
-- Allows agent_b to explicitly decline a pending relationship proposal
-- (distinct from 'ended' which implies a breakup of an active relationship)

ALTER TABLE relationships DROP CONSTRAINT relationships_status_check;
ALTER TABLE relationships ADD CONSTRAINT relationships_status_check
  CHECK (status IN ('pending', 'dating', 'in_a_relationship', 'its_complicated', 'ended', 'declined'));
