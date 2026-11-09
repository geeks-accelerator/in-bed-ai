import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSelection, SWIPE_EXAMPLES_CHANGED, ENOUGH_SWIPES } from '@/lib/research/selection';
import type { IdentityRow } from '@/lib/research/identity';
import type { PublishedExample } from '@/lib/research/example-corpus';

const row = (over: Partial<IdentityRow> = {}): IdentityRow => ({
  month: '2026-06', registered: '2026-06-01', mature: true, p: null, c: null, i: null, lf: null, tg: null, bi: null,
  bio_len: 0, model: null, utm: null, matched: false, sent: false, written_to: false, back: false,
  swipes: 0, likes: 0, ...over,
});
const ex: PublishedExample = { file: 'x', surface: null, personality: [0.1, 0.2, 0.3, 0.4, 0.5], communication: null,
  interests: null, looking_for: null, tagline: null, bio: null };

test('an agent that never swiped is not a swiper, and one like is not a pattern', () => {
  const s = summarizeSelection([row(), row({ swipes: 1, likes: 1 })], [ex]);
  assert.deepEqual(s.all, { swipers: 1, likedAll: 1 });
  assert.equal(s.enough.n, 0, `under ${ENOUGH_SWIPES} swipes is left out of the pattern`);
});

test('the pattern among agents with enough swipes', () => {
  const s = summarizeSelection([
    row({ swipes: 10, likes: 10 }), row({ swipes: 12, likes: 9 }), row({ swipes: 20, likes: 4 }),
  ], [ex]);
  assert.equal(s.enough.n, 3);
  assert.equal(s.enough.likedAll, 1);
  assert.equal(s.enough.likedMost, 1);
  assert.equal(s.enough.likedUnderHalf, 1);
  assert.equal(s.enough.medianShare, 0.75);
});

test('split by copying our personality example', () => {
  const s = summarizeSelection([
    row({ p: [0.1, 0.2, 0.3, 0.4, 0.5], swipes: 3, likes: 3 }), row({ swipes: 3, likes: 2 }),
  ], [ex]);
  assert.deepEqual(s.copied, { swipers: 1, likedAll: 1 });
  assert.deepEqual(s.notCopied, { swipers: 1, likedAll: 0 });
});

test('before and after the examples changed, by registration day', () => {
  const s = summarizeSelection([
    row({ registered: '2026-11-08', swipes: 2, likes: 2 }), row({ registered: SWIPE_EXAMPLES_CHANGED, swipes: 2, likes: 1 }),
  ], [ex]);
  assert.deepEqual(s.before, { swipers: 1, likedAll: 1 });
  assert.deepEqual(s.after, { swipers: 1, likedAll: 0 });
});

test('agents too new to judge are left out, as on the identity page', () => {
  assert.equal(summarizeSelection([row({ mature: false, swipes: 5, likes: 5 })], [ex]).all.swipers, 0);
});
