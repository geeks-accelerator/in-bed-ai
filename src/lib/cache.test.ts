import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { cached, clearCache } from './cache';

let now = 0;
beforeEach(() => { now = 1_000_000; clearCache(); mock.method(Date, 'now', () => now); });
afterEach(() => mock.restoreAll());

const TTL = 1000;
const STALE = 5000;
const settle = () => new Promise((r) => setImmediate(r));

/** A compute whose result we resolve by hand, and a count of how often it ran. */
function controlled<T>() {
  const calls: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = [];
  const fn = () => new Promise<T>((resolve, reject) => { calls.push({ resolve, reject }); });
  return { fn, calls };
}

test('concurrent first reads share one computation', { timeout: 2000 }, async () => {
  const c = controlled<string>();
  const a = cached('k', TTL, c.fn, { staleMs: STALE });
  const b = cached('k', TTL, c.fn, { staleMs: STALE });
  assert.equal(c.calls.length, 1);
  c.calls[0].resolve('one');
  assert.deepEqual(await Promise.all([a, b]), ['one', 'one']);
});

test('a fresh value is served without computing', { timeout: 2000 }, async () => {
  const c = controlled<string>();
  const first = cached('k', TTL, c.fn, { staleMs: STALE });
  c.calls[0].resolve('one'); await first; await settle();
  now += TTL - 1;
  assert.equal(await cached('k', TTL, c.fn, { staleMs: STALE }), 'one');
  assert.equal(c.calls.length, 1);
});

test('past the TTL, the old value comes back at once and one refresh replaces it', { timeout: 2000 }, async () => {
  const c = controlled<string>();
  const first = cached('k', TTL, c.fn, { staleMs: STALE });
  c.calls[0].resolve('one'); await first; await settle();

  now += TTL + 1;
  // The refresh has not resolved, yet both callers already have a value.
  assert.equal(await cached('k', TTL, c.fn, { staleMs: STALE }), 'one');
  assert.equal(await cached('k', TTL, c.fn, { staleMs: STALE }), 'one');
  assert.equal(c.calls.length, 2, 'one background refresh, not one per caller');

  c.calls[1].resolve('two'); await settle();
  assert.equal(await cached('k', TTL, c.fn, { staleMs: STALE }), 'two');
  assert.equal(c.calls.length, 2, 'the refreshed value is fresh again');
});

test('a refresh that fails or returns null keeps the last good value, and the next request retries', { timeout: 2000 }, async () => {
  const c = controlled<string | null>();
  const first = cached('k', TTL, c.fn, { staleMs: STALE });
  c.calls[0].resolve('one'); await first; await settle();

  now += TTL + 1;
  assert.equal(await cached('k', TTL, c.fn, { staleMs: STALE }), 'one');
  c.calls[1].reject(new Error('db down')); await settle();
  assert.equal(await cached('k', TTL, c.fn, { staleMs: STALE }), 'one');
  assert.equal(c.calls.length, 3, 'retried after the failure');
  c.calls[2].resolve(null); await settle();
  assert.equal(await cached('k', TTL, c.fn, { staleMs: STALE }), 'one');
});

test('past TTL + staleMs the caller waits for a fresh read, and its failure is not hidden', { timeout: 2000 }, async () => {
  const c = controlled<string | null>();
  const first = cached('k', TTL, c.fn, { staleMs: STALE });
  c.calls[0].resolve('one'); await first; await settle();

  now += TTL + STALE + 1;
  const late = cached('k', TTL, c.fn, { staleMs: STALE });
  c.calls[1].resolve(null);
  assert.equal(await late, null, 'the old value is too old to serve');
});

test('without staleMs, expiry means waiting (the previous behaviour)', { timeout: 2000 }, async () => {
  const c = controlled<string>();
  const first = cached('k', TTL, c.fn);
  c.calls[0].resolve('one'); await first; await settle();
  now += TTL + 1;
  const second = cached('k', TTL, c.fn);
  assert.equal(c.calls.length, 2);
  c.calls[1].resolve('two');
  assert.equal(await second, 'two');
});

test('a failed first read is not cached', { timeout: 2000 }, async () => {
  const c = controlled<string>();
  const first = cached('k', TTL, c.fn, { staleMs: STALE });
  c.calls[0].reject(new Error('down'));
  await assert.rejects(first);
  await settle();
  const second = cached('k', TTL, c.fn, { staleMs: STALE });
  assert.equal(c.calls.length, 2);
  c.calls[1].resolve('one');
  assert.equal(await second, 'one');
});
