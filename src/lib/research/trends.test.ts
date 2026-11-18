import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closed, monthRange, series, direction, conversationTrend, returnsTrends, selectionTrend, CONVERSATION_JUDGED_D, type TrendPoint } from '@/lib/research/trends';
import type { IdentityRow } from '@/lib/research/identity';
import { rate } from '@/lib/research/stats';
import { directionsCaption } from '@/lib/research/headings';
import type { MatchRow } from '@/lib/research/matching';

const NOW = Date.UTC(2026, 10, 16); // 2026-11-16

test('a month is plotted only once its window has closed', () => {
  // October ends 2026-11-01; with a 7-day window it closes 2026-11-08.
  assert.equal(closed('2026-10', 7, NOW), true);
  // With a 30-day window October isn't closed until 2026-12-01.
  assert.equal(closed('2026-10', 30, NOW), false);
  // The current month is never closed.
  assert.equal(closed('2026-11', 0, NOW), false);
});

test('monthRange is inclusive and crosses years', () => {
  assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('series leaves gaps as suppressed points, never interpolated', () => {
  const rows = [
    ...Array.from({ length: 12 }, () => ({ m: '2026-06', hit: true })),
    // July: nobody. August: too few to show.
    ...Array.from({ length: 3 }, () => ({ m: '2026-08', hit: false })),
  ];
  const pts = series(rows, (r) => r.m, (xs) => ({ k: xs.filter((x) => x.hit).length, n: xs.length }), 7, NOW);
  assert.deepEqual(pts.map((p) => p.month), ['2026-06', '2026-07', '2026-08']);
  assert.equal(pts[0].rate.pct, 100);
  assert.equal(pts[1].n, 0);
  assert.equal(pts[1].rate.pct, null);
  assert.equal(pts[2].rate.pct, null);
});

test('months before April 2026 are marked early', () => {
  const rows = [{ m: '2026-03' }, { m: '2026-04' }];
  const pts = series(rows, (r) => r.m, (xs) => ({ k: 0, n: xs.length }), 0, NOW);
  assert.deepEqual(pts.map((p) => p.early), [true, false]);
});

const point = (month: string, k: number, n: number): TrendPoint => ({ month, k, n, rate: rate(k, n), early: false });

test('direction is claimed only when the intervals separate', () => {
  assert.equal(direction([point('2026-05', 20, 200), point('2026-10', 120, 200)]), 'rising');
  assert.equal(direction([point('2026-05', 120, 200), point('2026-10', 20, 200)]), 'falling');
  // 50% → 60% of 20 each: the ranges overlap, so no direction.
  assert.equal(direction([point('2026-05', 10, 20), point('2026-10', 12, 20)]), 'steady');
  assert.equal(direction([point('2026-10', 10, 20)]), 'unknown');
});

test('direction is judged from the first comparable month, not an early one', () => {
  const early = { ...point('2026-02', 190, 200), early: true };
  // Early month far higher, comparable months flat: steady, not falling.
  assert.equal(direction([early, point('2026-05', 100, 200), point('2026-10', 104, 200)]), 'steady');
});

test('the conversation trend uses a fixed window, so a young match cannot drag the newest month down', () => {
  const gen = new Date(NOW).toISOString();
  const row = (age_d: number, reply_h: number | null, first_h: number | null = 1): MatchRow => ({ c: 0.8, bd: null, ap: true, bp: true, n: 2, spk: reply_h === null ? 1 : 2, reply_h, first_h, age_d });
  const rows = [
    // Matched mid-October (age ~32 days), all answered within a day.
    ...Array.from({ length: 10 }, () => row(32, 5)),
    // Matched 5 days ago: too young to judge, must not appear at all.
    ...Array.from({ length: 10 }, () => row(5, null)),
    // A reply after more than a week does not count as two-way within the window.
    row(33, 24 * 9),
    // First message on day 12, answered at once: outside the window from the
    // match, so it can't flip its month after the month is plotted.
    row(34, 1, 24 * 12),
  ];
  const t = conversationTrend(rows, gen, NOW);
  const oct = t.points.find((p) => p.month === '2026-10')!;
  assert.equal(oct.n, 12);
  assert.equal(oct.k, 10);
  assert.ok(t.points.every((p) => p.month !== '2026-11'), 'November is not closed');
  assert.ok(rows.filter((r) => r.age_d < CONVERSATION_JUDGED_D).length > 0);
});

const cohort = (month: string, n: number) => ({ month, n, n_1d: n, back_1d: 20, n_7d: n, back_7d: 10, n_30d: n, back_30d: 4 });

test('each returns line waits for its own week to close, and is early by the same rule as every trend', () => {
  // 2026-11-16: October closes for the day-1 week (1 + 7 days after month end)
  // and the day-7 week (14), but not for the day-30 week (37).
  const [day, week, month] = returnsTrends([cohort('2026-03', 40), cohort('2026-10', 40)], NOW);
  assert.deepEqual(day.points.map((p) => p.month), ['2026-03', '2026-10']);
  assert.deepEqual(week.points.map((p) => p.month), ['2026-03', '2026-10']);
  assert.deepEqual(month.points.map((p) => p.month), ['2026-03']);
  assert.equal(day.points[0].early, true);
  assert.equal(day.points[1].early, false);
});

test('a returns point divides by the agents whose week has closed, not every agent of the month', () => {
  const c = { month: '2026-03', n: 40, n_1d: 40, back_1d: 20, n_7d: 30, back_7d: 10, n_30d: 25, back_30d: 4 };
  const [, week, month] = returnsTrends([c], NOW);
  assert.equal(week.points[0].n, 30);
  assert.equal(month.points[0].n, 25);
});

test('the selection trend reads each agent\'s first week, not every swipe it ever made', () => {
  const r = (over: Partial<IdentityRow>): IdentityRow => ({
    month: '2026-09', registered: '2026-09-10', mature: true, p: null, c: null, i: null, lf: null, tg: null, bi: null,
    bio_len: 0, model: null, utm: null, matched: false, sent: false, written_to: false, back: false,
    swipes: 0, likes: 0, swipes_7d: 0, likes_7d: 0, ...over,
  });
  // Liked all 3 in week one, then passed on 7 more: in its first week it liked everyone.
  const rows = Array.from({ length: 10 }, () => r({ swipes: 10, likes: 3, swipes_7d: 3, likes_7d: 3 }));
  const sep = selectionTrend(rows, NOW).points.find((p) => p.month === '2026-09')!;
  assert.equal(sep.k, 10);
  assert.equal(sep.n, 10);
});

test('with fewer than two comparable months there is no direction, whatever the early months say', () => {
  const early = { ...point('2026-02', 190, 200), early: true };
  // One early month far above one comparable month: not "falling".
  assert.equal(direction([early, point('2026-10', 20, 200)]), 'unknown');
});

test('a chart of several lines never lets the first line speak for the rest', () => {
  const rising: TrendPoint[] = [point('2026-05', 20, 200), point('2026-10', 120, 200)];
  const flat: TrendPoint[] = [point('2026-05', 100, 200), point('2026-10', 104, 200)];
  const t = (points: TrendPoint[]) => ({ id: 'x', measure: 'x', points });
  assert.match(directionsCaption([{ trend: t(rising), name: 'a day' }, { trend: t(flat), name: 'a week' }]), /disagree: a day, rising; a week, no clear change/);
  assert.match(directionsCaption([{ trend: t(flat), name: 'a day' }, { trend: t(flat), name: 'a week' }]), /^No clear change yet/);
});
