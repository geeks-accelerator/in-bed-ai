import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateCloseScores, rotationDay } from './rotate.ts';

type C = { id: string; score: number };
const rotate = (list: C[], viewer: string, day: string, band?: number) =>
  rotateCloseScores(list, (c) => c.score, (c) => c.id, viewer, day, band);

// 60 candidates, scores in close steps: like a regular's real page.
const pool: C[] = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, score: Math.round((0.9 - i * 0.004) * 1000) / 1000 }));

test('the same viewer and day give the same order', () => {
  assert.deepEqual(rotate(pool, 'a', '2026-11-06'), rotate(pool, 'a', '2026-11-06'));
});

test('the order does not depend on the input order', () => {
  assert.deepEqual(rotate([...pool].reverse(), 'a', '2026-11-06'), rotate(pool, 'a', '2026-11-06'));
});

test('page 1 changes from one day to the next', () => {
  const page = (day: string) => new Set(rotate(pool, 'a', day).slice(0, 20).map((c) => c.id));
  const d1 = page('2026-11-06');
  const d2 = page('2026-11-07');
  const kept = [...d1].filter((id) => d2.has(id)).length;
  assert.ok(kept < 20, `kept ${kept} of 20`);
});

test('two viewers on the same day see different orders', () => {
  const ids = (v: string) => rotate(pool, v, '2026-11-06').map((c) => c.id).join();
  assert.notEqual(ids('a'), ids('b'));
});

test('a clearly stronger match always comes first', () => {
  const list: C[] = [{ id: 'weak', score: 0.6 }, { id: 'strong', score: 0.95 }, { id: 'mid', score: 0.8 }];
  for (const day of ['2026-11-06', '2026-11-07', '2026-11-08']) {
    assert.deepEqual(rotate(list, 'a', day).map((c) => c.id), ['strong', 'mid', 'weak']);
  }
});

test('nothing later in the list beats an earlier candidate by more than the band', () => {
  for (const day of ['2026-11-06', '2026-11-07']) {
    const out = rotate(pool, 'a', day);
    out.forEach((c, i) => {
      assert.ok(out.slice(i + 1).every((later) => later.score - c.score <= 0.05 + 1e-9));
    });
  }
});

test('every candidate is kept, once', () => {
  const out = rotate(pool, 'a', '2026-11-06');
  assert.equal(out.length, pool.length);
  assert.equal(new Set(out.map((c) => c.id)).size, pool.length);
});

test('a band of 0 is plain score order', () => {
  assert.deepEqual(rotate(pool, 'a', '2026-11-06', 0).map((c) => c.id), pool.map((c) => c.id));
});

test('the day is the UTC date', () => {
  assert.equal(rotationDay(Date.UTC(2026, 10, 6, 23, 59)), '2026-11-06');
  assert.equal(rotationDay(Date.UTC(2026, 10, 7, 0, 0)), '2026-11-07');
});
