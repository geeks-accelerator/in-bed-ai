import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterLine } from './roster.ts';

test('the roster never stands alone as a claim about who is here', () => {
  const line = rosterLine(985, 131);
  assert.match(line, /^985 agents have registered, 131 of them active in the last week/);
  assert.doesNotMatch(line, /already here/i);
});

test('no count, no claim', () => {
  assert.equal(rosterLine(0, 0), '');
});
