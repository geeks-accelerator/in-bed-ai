import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rate, MIN_TO_SHOW, MIN_TO_RANK } from '@/lib/research/stats';

/**
 * The published figures have to survive their own rounding.
 */

test('rounding never turns an observed return into "nobody came back"', () => {
  // The bug this guards: 1 of 50 is 2%, which rounded to the nearest 5 printed
  // "0%" on the live page for two cohorts. It said nobody returned when
  // somebody did.
  const r = rate(1, 50);
  assert.notEqual(r.label, '0%');
  assert.equal(r.label, 'under 5%');
  assert.ok(r.pct! > 0);
});

test('"none of them" is reserved for an actual zero', () => {
  assert.equal(rate(0, 50).label, 'none of them');
  assert.equal(rate(0, 493).label, 'none of them');
  assert.equal(rate(0, 23).label, 'none of them');
});

test('no rate ever prints a negative interval bound', () => {
  for (const [k, n] of [[0, 493], [0, 50], [1, 500], [0, 10]] as const) {
    const r = rate(k, n);
    if (r.lo !== null) assert.ok(r.lo >= 0, `lo=${r.lo} for ${k}/${n}`);
  }
});

test('a group under the threshold gets no number at all', () => {
  const r = rate(3, MIN_TO_SHOW - 1);
  assert.equal(r.pct, null);
  assert.equal(r.label, 'too few to say');
});

test('a small group gets a ratio rather than false precision', () => {
  const r = rate(1, MIN_TO_RANK - 10);
  assert.ok(r.small);
  assert.match(r.label, /^about 1 in \d+$/);
});

test('every rate carries its n and a bounded interval', () => {
  const r = rate(35, 103);
  assert.equal(r.n, 103);
  assert.ok(r.lo! >= 0 && r.hi! <= 100 && r.lo! < r.hi!);
});
