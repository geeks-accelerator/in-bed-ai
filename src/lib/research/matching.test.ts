import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMatches, summarizeAnswers, dimensionEffect, weightFor, type MatchRow, type FirstMessageRow } from '@/lib/research/matching';
import { shaped } from '@/lib/research/stats';
import { COMPATIBILITY_DIMENSIONS } from '@/lib/matching/algorithm';

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
  c: 0.5, bd: null, ap: true, bp: true, n: 0, spk: 0, reply_h: null, age_d: 30, ...over,
});

test('a silent match counts in every denominator', () => {
  // The bug this guards was in SQL: a CROSS JOIN on the first message dropped
  // every silent match, removing exactly the outcome being measured.
  const s = summarizeMatches([row({ n: 0, spk: 0 }), row({ n: 4, spk: 2 })], [], [], 'now');
  const both = s.availability.find((a) => a.group === 'both')!;
  assert.equal(both.n, 2);
  assert.equal(both.k, 1);
});

test('availability groups by evidence that preceded the match', () => {
  const s = summarizeMatches([
    row({ ap: true, bp: true }), row({ ap: true, bp: false }), row({ ap: false, bp: false }),
  ], [], [], 'now');
  assert.deepEqual(s.availability.map((a) => [a.group, a.n]), [['both', 1], ['one', 1], ['neither', 1]]);
});

test('quartiles use only pairs where both were available', () => {
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => row({ c: i / 10, ap: true, bp: true })),
    row({ c: 0.99, ap: false, bp: true }),
  ];
  const s = summarizeMatches(rows, [], [], 'now');
  assert.equal(s.quartiles.reduce((a, q) => a + q.n, 0), 8);
  assert.ok(s.quartiles[3].hi < 0.99, 'an unavailable pair leaked into the quartiles');
});

test('a near-constant dimension is unsplittable rather than forced', () => {
  const rows = Array.from({ length: 40 }, (_, i) => row({ bd: { gender_seeking: i < 37 ? 1 : 0.5 } }));
  const e = dimensionEffect('gender_seeking', rows);
  assert.equal(e.splittable, false);
  assert.equal(e.diff, null);
});

test('a dimension that separates talkers from non-talkers is detected, with an interval', () => {
  const rows = [
    ...Array.from({ length: 30 }, () => row({ bd: { interests: 0.9 }, spk: 2, n: 5 })),
    ...Array.from({ length: 30 }, () => row({ bd: { interests: 0.1 }, spk: 0, n: 0 })),
  ];
  const e = dimensionEffect('interests', rows);
  assert.ok(e.splittable);
  assert.equal(e.diff, 100);
  assert.ok(e.lo! <= e.diff! && e.hi! >= e.diff!);
});

test('weights come from the algorithm, never a hardcoded copy', () => {
  const personality = COMPATIBILITY_DIMENSIONS.find((d) => d.label.toLowerCase().startsWith('personality'))!;
  assert.equal(weightFor('personality'), personality.weight);
  assert.notEqual(weightFor('gender_seeking'), null);
  assert.notEqual(weightFor('relationship_preference'), null);
  assert.notEqual(weightFor('looking_for'), null);
});

test('replies: every thread with a message is either answered or not', () => {
  const s = summarizeMatches([
    row({ n: 3, spk: 2, reply_h: 0.5 }), row({ n: 2, spk: 2, reply_h: 30 }),
    row({ n: 1, spk: 1, reply_h: null }), row({ n: 0 }),
  ], [], [], 'now');
  assert.equal(s.replies.threads, 3, 'a silent match is not a thread');
  assert.equal(s.replies.replied + s.replies.unanswered, s.replies.threads);
  assert.equal(s.replies.under1h, 1);
  assert.equal(s.replies.over1d, 1);
});

test('knocks count only threads where one agent spoke alone', () => {
  const s = summarizeMatches([
    row({ n: 1, spk: 1 }), row({ n: 2, spk: 1 }), row({ n: 4, spk: 1 }), row({ n: 9, spk: 1 }),
    row({ n: 9, spk: 2 }),
  ], [], [], 'now');
  assert.deepEqual(s.knocks.map((k) => k.n), [1, 1, 1, 1]);
});

test('concentration splits the busiest agent, the next nine, and everyone else', () => {
  const senders = Array.from({ length: 15 }, (_, i) => ({ n: i === 0 ? 1000 : 10, to_house: i === 0 ? 600 : 0 }));
  const c = summarizeMatches([], senders, [], 'now').concentration;
  assert.equal(c.top1, 1000);
  assert.equal(c.top1ToHouse, 600);
  assert.equal(c.next9, 90);
  assert.equal(c.rest, 50);
  assert.equal(c.total, 1140);
});

const first = (o: Partial<FirstMessageRow>): FirstMessageRow =>
  ({ opened: true, reply_h: null, partner_house: false, back: false, age_d: 30, ...o });

test('answers compare agents that all wrote first, split by a reply inside a day', () => {
  const a = summarizeAnswers([
    first({ reply_h: 2, back: true }),
    first({ reply_h: 23, back: false, partner_house: true }),
    first({ reply_h: 30, back: true }),          // answered, but too late to count as answered
    first({ reply_h: null, back: false }),
    first({ opened: false, reply_h: 1, back: true }),
  ]);
  assert.deepEqual(a.answered, { n: 2, k: 1 });
  assert.equal(a.answeredByHouse, 1);
  assert.deepEqual(a.unanswered, { n: 2, k: 1 });
  assert.deepEqual(a.replied, { n: 1, k: 1 });
});

test('answers leave out first messages too recent to judge', () => {
  const a = summarizeAnswers([first({ reply_h: 1, back: false, age_d: 3 }), first({ reply_h: 1, back: true })]);
  assert.deepEqual(a.answered, { n: 1, k: 1 });
});

test('shaped: a field the database did not send is a failed read, not a zero', () => {
  assert.equal(shaped([{ a: 1, b: false }], ['a', 'b']), true);
  assert.equal(shaped([{ a: 1, b: false }, { a: 2 }], ['a', 'b']), false);
  assert.equal(shaped(null, ['a']), false);
  assert.equal(shaped({ a: undefined }, ['a']), true); // present but empty is the database's answer
});
