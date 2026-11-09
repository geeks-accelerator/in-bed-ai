import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('research pages use real characters, never \\u escapes', () => {
  // JSX processes escapes inside {expressions} but NOT in attribute strings or
  // text content, so "\u2014" shipped to production as the literal six
  // characters on a live chart label. One rule with no exceptions is easier to
  // follow than remembering which context decodes.
  const dirs = ['src/app/research', 'src/components/features/research'];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(e.name)) files.push(f);
    }
  };
  for (const d of dirs) walk(path.join(process.cwd(), d));
  assert.ok(files.length > 0, 'found no research page files to check');
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf-8');
    const hit = /\\u[0-9a-fA-F]{4}/.exec(src);
    assert.equal(hit, null,
      `${path.relative(process.cwd(), f)} contains ${hit?.[0]} — write the character itself`);
  }
});
