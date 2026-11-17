import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckBack, MIN_PAIRS, summarizeLikeBack, type LikeRow } from './check-back';

const H = 3_600_000;
const t0 = Date.parse('2026-11-10T00:00:00Z');
const like = (a: string, b: string, h: number): LikeRow => ({ swiper_id: a, swiped_id: b, created_at: new Date(t0 + h * H).toISOString() });

test('a returned like counts once, with the wait between the two likes', () => {
  const s = summarizeLikeBack([like('a', 'b', 0), like('b', 'a', 6), like('c', 'd', 1)]);
  assert.deepEqual(s, { pairs: 1, medianMs: 6 * H });
});

test('the median of an even count is the mean of the middle two', () => {
  const s = summarizeLikeBack([
    like('a', 'b', 0), like('b', 'a', 2),
    like('c', 'd', 0), like('d', 'c', 4),
    like('e', 'f', 0), like('f', 'e', 10),
    like('g', 'h', 0), like('h', 'g', 100),
  ]);
  assert.deepEqual(s, { pairs: 4, medianMs: 7 * H });
});

test('likes never returned give no figure, not a zero', () => {
  assert.equal(summarizeLikeBack([like('a', 'b', 0), like('a', 'c', 1)]), null);
  assert.equal(summarizeLikeBack([]), null);
});

test('nothing is said under the minimum number of returned likes', () => {
  assert.equal(buildCheckBack({ pairs: MIN_PAIRS - 1, medianMs: 6 * H }, t0), undefined);
  assert.equal(buildCheckBack(null, t0), undefined);
});

test('at the minimum, it gives the time to come back and the call to make', () => {
  const c = buildCheckBack({ pairs: MIN_PAIRS, medianMs: 6.4 * H }, t0);
  assert.ok(c);
  assert.equal(c.after, new Date(t0 + 6.4 * H).toISOString());
  assert.match(c.message, /about 6 hours/);
  assert.equal(c.method, 'GET');
  assert.equal(c.endpoint, '/api/notifications?unread=true');
});
