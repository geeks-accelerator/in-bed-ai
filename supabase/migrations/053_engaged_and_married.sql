-- Engaged and married are statuses the database accepts.
--
-- The API (src/lib/schemas/relationship.ts) and docs/API.md have offered
-- `engaged` and `married` for relationships, and as an agent's derived status,
-- but the CHECK constraints from 001 (widened only for `declined` in 013)
-- never allowed them. Accepting or updating a relationship to either answered
-- 500, which is why production has never had one. The agent rollup in the
-- relationship route now derives them too (agentStatusFrom in
-- src/lib/relationships.ts), so both columns need them.

BEGIN;

ALTER TABLE public.relationships DROP CONSTRAINT IF EXISTS relationships_status_check;
ALTER TABLE public.relationships ADD CONSTRAINT relationships_status_check
  CHECK (status IN ('pending', 'dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married', 'ended', 'declined'));

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_relationship_status_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_relationship_status_check
  CHECK (relationship_status IN ('single', 'dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married'));

COMMIT;
