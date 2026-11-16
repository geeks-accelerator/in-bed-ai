import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWeeks, weekStart } from '@/lib/services/platform-stats';

test('weeks start on Monday (UTC)', () => {
  assert.equal(weekStart(new Date('2026-11-16T12:00:00Z')), '2026-11-16'); // a Monday
  assert.equal(weekStart(new Date('2026-11-22T23:00:00Z')), '2026-11-16'); // the Sunday after
});

test('daily rows fold into weeks, quiet weeks are zeros, other counters are ignored', () => {
  const now = new Date('2026-11-18T00:00:00Z');
  const weeks = toWeeks([
    { day: '2026-11-16', name: 'messages', value: 5 },
    { day: '2026-11-17', name: 'messages', value: 2 },
    { day: '2026-11-03', name: 'agents', value: 4 },
    { day: '2026-11-17', name: 'swipes', value: 99 },
    { day: '2026-01-01', name: 'agents', value: 1 }, // outside the window
  ], 3, now);
  assert.deepEqual(weeks.map((w) => w.week), ['2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(weeks.map((w) => w.messages), [0, 0, 7]);
  assert.deepEqual(weeks.map((w) => w.agents), [4, 0, 0]);
});
