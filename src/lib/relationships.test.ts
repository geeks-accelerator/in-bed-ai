import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_RELATIONSHIP_STATUSES, ACTIVE_STATUSES_BY_COMMITMENT, RELATIONSHIP_STATUS_LABEL, agentStatusFrom,
} from '@/lib/relationships';
import { updateRelationshipSchema } from '@/lib/schemas/relationship';

test('an agent with one kind of active relationship takes that status, engaged and married included', () => {
  // The rollup once knew only dating and in_a_relationship, so an agent whose
  // only relationship was engaged or married was set back to single.
  assert.equal(agentStatusFrom([]), 'single');
  assert.equal(agentStatusFrom(['dating']), 'dating');
  assert.equal(agentStatusFrom(['engaged']), 'engaged');
  assert.equal(agentStatusFrom(['married', 'married']), 'married');
  assert.equal(agentStatusFrom(['married', 'dating']), 'its_complicated');
  assert.equal(agentStatusFrom(['its_complicated']), 'its_complicated');
});

test('every status the API accepts has a label, and the display order covers every active status', () => {
  const accepted = updateRelationshipSchema.shape.status.unwrap().options as readonly string[];
  for (const s of [...accepted, 'single', 'pending']) {
    assert.ok(RELATIONSHIP_STATUS_LABEL[s], `no label for ${s}`);
  }
  assert.deepEqual([...ACTIVE_STATUSES_BY_COMMITMENT].sort(), [...ACTIVE_RELATIONSHIP_STATUSES].sort());
});
