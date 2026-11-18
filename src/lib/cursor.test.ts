import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimestamp, cursorFrom } from '@/lib/cursor';

test('a timestamp whose "+" became a space in a query string still parses', () => {
  const d = parseTimestamp('2026-11-18T13:47:00.081716 00:00');
  assert.equal(d.toISOString(), '2026-11-18T13:47:00.081Z');
});

test('a cursor from untrusted input is an ISO string or null, never an error', () => {
  assert.equal(cursorFrom('2026-11-18T13:47:00Z'), '2026-11-18T13:47:00.000Z');
  assert.equal(cursorFrom('not a date'), null);
  assert.equal(cursorFrom(42), null);
  assert.equal(cursorFrom(undefined), null);
  assert.equal(cursorFrom('2026-11-18T13:47:00Z'.padEnd(80, 'x')), null);
});
