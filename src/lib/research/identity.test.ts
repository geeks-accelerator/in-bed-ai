import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, cohortOf, publishedPersonalityShare, type IdentityRow } from '@/lib/research/identity';
import { PUBLISHED_EXAMPLES, type PublishedExample } from '@/lib/research/example-corpus';

const row = (over: Partial<IdentityRow> = {}): IdentityRow => ({
  month: '2026-06', mature: true, p: null, c: null, i: null, lf: null, tg: null, bi: null,
  registered: '2026-06-01', bio_len: 0, model: null, utm: null, matched: false, sent: false, written_to: false, back: false,
  swipes: 0, likes: 0, ...over,
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
    row({ p: dominant, matched: true, written_to: true, back: true }),
    row({ p: [0.11, 0.22, 0.33, 0.44, 0.55], matched: true }),
  ], 'now', 0);
  assert.equal(s.cohorts.find((c) => c.cohort === 'ours')!.matched, 1);
  assert.equal(s.cohorts.find((c) => c.cohort === 'ours')!.back, 1);
  assert.equal(s.cohorts.find((c) => c.cohort === 'own')!.matched, 1);
});

test('agents too new to judge are left out of every figure, not just the funnel', () => {
  // They used to count toward the declaration charts only, which gave the page
  // three populations that differed by a handful and read as arithmetic errors.
  const s = summarize([row({ p: dominant, mature: false })], 'now', 0);
  assert.equal(s.cohorts.reduce((a, b) => a + b.n, 0), 0);
  assert.equal(s.total, 0);
  assert.equal(s.recent, 1);
  assert.equal(s.traits[0].buckets.reduce((a, b) => a + b.n, 0), 0);
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

test('sending a message is counted separately from being written to', () => {
  const s = summarize([row({ p: [0.11, 0.22, 0.33, 0.44, 0.55], sent: true, written_to: false })], 'now', 0);
  const own = s.cohorts.find((c) => c.cohort === 'own')!;
  assert.equal(own.sent, 1);
  assert.equal(own.written_to, 0);
});

test('bio bands cover every mature agent exactly once', () => {
  const lens = [0, 50, 199, 200, 599, 600, 5000];
  const s = summarize(lens.map((l) => row({ bio_len: l })), 'now', 0);
  assert.equal(s.bios.reduce((a, b) => a + b.n, 0), lens.length);
  assert.deepEqual(s.bios.map((b) => b.n), [1, 2, 2, 2]);
});

test('an agent that declared no personality is its own cohort, not "their own values"', () => {
  const s = summarize([row({ p: null }), row({ p: [0.11, 0.22, 0.33, 0.44, 0.55] })], 'now', 0);
  assert.equal(s.cohorts.find((c) => c.cohort === 'none')!.n, 1);
  assert.equal(s.cohorts.find((c) => c.cohort === 'own')!.n, 1);
});

test('cohorts sum to the total, and recent agents are counted out everywhere', () => {
  const s = summarize([row({ p: null }), row({}), row({ mature: false, bi: 'x' })], 'now', 0);
  assert.equal(s.total, 2);
  assert.equal(s.recent, 1);
  assert.equal(s.cohorts.reduce((a, c) => a + c.n, 0), s.total);
  const bio = s.fields.find((f) => f.field === 'bio')!;
  assert.equal(bio.ours + bio.own + bio.missing, s.total);
});

test('copiers count agents, not fields: copying both number sets counts once', () => {
  const ex: PublishedExample = { file: 'x', surface: null, personality: [0.1, 0.2, 0.3, 0.4, 0.5], communication: [0.1, 0.2, 0.3, 0.4],
               interests: null, looking_for: null, tagline: null, bio: null };
  const s = summarize([row({ p: [0.1, 0.2, 0.3, 0.4, 0.5], c: [0.1, 0.2, 0.3, 0.4] })], 'now', 0, [ex]);
  assert.equal(s.fields.filter((f) => f.field === 'personality' || f.field === 'communication style')
    .reduce((a, f) => a + f.ours, 0), 2);
  assert.equal(s.copiers.numbers, 1);
  assert.equal(s.copiers.words, 0);
});

test('the published-personality share counts our vectors over every agent covered', () => {
  // One function for the hub, the identity chapter and the home page, so the
  // three can never print different numbers for the same finding.
  const s = summarize([
    row({ p: dominant }),
    row({ p: [0.5, 0.5, 0.5, 0.5, 0.5] }),
    row({ p: [0.11, 0.22, 0.33, 0.44, 0.55] }),
    row({}),
  ], 'now', 0);
  assert.deepEqual(publishedPersonalityShare(s), { k: 1, n: 4 });
  // Every agent lands in exactly one cohort, so the cohorts add up to the total
  // the identity chapter divides by.
  assert.equal(s.cohorts.reduce((a, c) => a + c.n, 0), s.total);
});
