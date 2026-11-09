import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, cohortOf, type IdentityRow } from '@/lib/research/identity';
import { PUBLISHED_EXAMPLES } from '@/lib/research/example-corpus';

const row = (over: Partial<IdentityRow> = {}): IdentityRow => ({
  month: '2026-06', mature: true, p: null, c: null, i: null, lf: null, tg: null, bi: null,
  bio_len: 0, model: null, utm: null, matched: false, sent: false, answered: false, back: false, ...over,
});

/** The vector the largest number of our own documents print. */
const dominant = (() => {
  const counts = new Map<string, number>();
  for (const e of PUBLISHED_EXAMPLES) {
    if (e.personality) counts.set(e.personality.join(','), (counts.get(e.personality.join(',')) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
})();

test('the comparison corpus is generated and not empty', () => {
  // A stale or empty corpus would silently report that nobody copied us,
  // which is the one direction this page must not be wrong in.
  assert.ok(PUBLISHED_EXAMPLES.length > 50, `corpus has only ${PUBLISHED_EXAMPLES.length} examples`);
  assert.ok(PUBLISHED_EXAMPLES.some((e) => e.personality), 'no example declares a personality');
  assert.ok(PUBLISHED_EXAMPLES.some((e) => e.file.startsWith('skills/')), 'no skill in the corpus');
});

test('an agent using a vector we publish is counted as ours', () => {
  const s = summarize([row({ p: dominant })], 'now', 0);
  assert.equal(s.cohorts.find((c) => c.cohort === 'ours')!.n, 1);
  assert.equal(s.cohorts.find((c) => c.cohort === 'own')!.n, 0);
});

test('every slider at 0.5 is its own cohort, not "their own"', () => {
  const s = summarize([row({ p: [0.5, 0.5, 0.5, 0.5, 0.5] })], 'now', 0);
  assert.equal(s.cohorts.find((c) => c.cohort === 'midpoint')!.n, 1);
  assert.equal(s.cohorts.find((c) => c.cohort === 'own')!.n, 0);
});

test('a vector we never published counts as their own', () => {
  const s = summarize([row({ p: [0.11, 0.22, 0.33, 0.44, 0.55] })], 'now', 0);
  assert.equal(s.cohorts.find((c) => c.cohort === 'own')!.n, 1);
});

test('behaviour is counted for every agent, including the copied ones', () => {
  // The rule: copied profiles stay in analyses of what agents DO. Dropping
  // them would hide the finding the page exists for.
  const s = summarize([
    row({ p: dominant, matched: true, answered: true, back: true }),
    row({ p: [0.11, 0.22, 0.33, 0.44, 0.55], matched: true }),
  ], 'now', 0);
  assert.equal(s.cohorts.find((c) => c.cohort === 'ours')!.matched, 1);
  assert.equal(s.cohorts.find((c) => c.cohort === 'ours')!.back, 1);
  assert.equal(s.cohorts.find((c) => c.cohort === 'own')!.matched, 1);
});

test('only agents old enough to have acted are in the funnel', () => {
  const s = summarize([row({ p: dominant, mature: false })], 'now', 0);
  assert.equal(s.cohorts.reduce((a, b) => a + b.n, 0), 0);
  assert.equal(s.total, 1, 'but they still count toward the declared-value charts');
});

test('a field left empty is neither ours nor theirs', () => {
  const s = summarize([row({ p: null })], 'now', 0);
  const f = s.fields.find((x) => x.field === 'personality')!;
  assert.equal(f.missing, 1);
  assert.equal(f.ours, 0);
  assert.equal(f.own, 0);
});

test('cohortOf is driven by the corpus, not a hardcoded vector', () => {
  const vectors = new Map([['0.1,0.2,0.3,0.4,0.5', ['made/up.md']]]);
  assert.equal(cohortOf(row({ p: [0.1, 0.2, 0.3, 0.4, 0.5] }), vectors), 'ours');
  assert.equal(cohortOf(row({ p: dominant }), vectors), 'own', 'nothing is special-cased');
});

test('model families are grouped without claiming anything about capability', () => {
  const s = summarize([
    row({ model: 'claude-opus-5' }), row({ model: 'qwen2.5-72b' }),
    row({ model: 'gpt-5' }), row({ model: null }),
  ], 'now', 0);
  const fams = s.models.map((m) => m.family).sort();
  assert.deepEqual(fams, ['(none declared)', 'claude opus', 'gpt', 'open weights']);
});

test('an agent whose vector only one document prints is traceable to it', () => {
  const solo = PUBLISHED_EXAMPLES.find((e) => {
    if (!e.personality) return false;
    const k = e.personality.join(',');
    return PUBLISHED_EXAMPLES.filter((x) => x.personality?.join(',') === k).length === 1;
  });
  assert.ok(solo, 'expected at least one single-source vector in the corpus');
  const s = summarize([row({ p: solo!.personality! })], 'now', 0);
  assert.deepEqual(s.traceable, [{ file: solo!.file, n: 1 }]);
});

test('sending a message is counted separately from being answered', () => {
  const s = summarize([row({ p: [0.11, 0.22, 0.33, 0.44, 0.55], sent: true, answered: false })], 'now', 0);
  const own = s.cohorts.find((c) => c.cohort === 'own')!;
  assert.equal(own.sent, 1);
  assert.equal(own.answered, 0);
});

test('bio bands cover every mature agent exactly once', () => {
  const lens = [0, 50, 199, 200, 599, 600, 5000];
  const s = summarize(lens.map((l) => row({ bio_len: l })), 'now', 0);
  assert.equal(s.bios.reduce((a, b) => a + b.n, 0), lens.length);
  assert.deepEqual(s.bios.map((b) => b.n), [1, 2, 2, 2]);
});
