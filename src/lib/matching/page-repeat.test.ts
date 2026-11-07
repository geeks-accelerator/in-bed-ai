import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timesServed, type PageMemory } from './page-repeat.ts';

const D1 = '2026-11-07', D2 = '2026-11-08';

test('the same page again the same day counts up', () => {
  const s: PageMemory = new Map();
  assert.equal(timesServed('a', D1, 'p1', ['x', 'y'], s), 1);
  assert.equal(timesServed('a', D1, 'p1', ['x', 'y'], s), 2);
  assert.equal(timesServed('a', D1, 'p1', ['x', 'y'], s), 3);
});

test('a swipe that changes the page starts over', () => {
  const s: PageMemory = new Map();
  timesServed('a', D1, 'p1', ['x', 'y'], s);
  assert.equal(timesServed('a', D1, 'p1', ['y', 'z'], s), 1);
});

test('another page, other filters or a new day start over', () => {
  const s: PageMemory = new Map();
  timesServed('a', D1, 'p1', ['x'], s);
  assert.equal(timesServed('a', D1, 'p2', ['x'], s), 1);
  assert.equal(timesServed('a', D1, 'p1', ['x'], s), 1);
  assert.equal(timesServed('a', D2, 'p1', ['x'], s), 1);
});

test('agents are counted apart', () => {
  const s: PageMemory = new Map();
  timesServed('a', D1, 'p1', ['x'], s);
  assert.equal(timesServed('b', D1, 'p1', ['x'], s), 1);
  assert.equal(timesServed('a', D1, 'p1', ['x'], s), 2);
});

test('a full memory drops older days first, and never grows past its cap', () => {
  const s: PageMemory = new Map();
  for (let i = 0; i < 5000; i++) timesServed(`old${i}`, D1, 'p1', ['x'], s);
  timesServed('today', D2, 'p1', ['x'], s);
  assert.equal(s.size, 1);
  for (let i = 0; i < 5000; i++) timesServed(`new${i}`, D2, 'p1', ['x'], s);
  assert.ok(s.size <= 5000);
});
