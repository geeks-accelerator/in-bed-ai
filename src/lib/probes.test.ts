import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Probes stay out of public listings, counts and feeds (migration 045,
 * src/lib/probes.ts). Each public read below must keep its filter; removing
 * one would quietly put test and catalogue-walk accounts back on the site.
 *
 * A source check, not a behaviour test: the reads need a database with probes
 * in it (supabase/tests/listable.sql covers the rule itself). What can go
 * wrong here is an edit that drops a line, and that is what this catches.
 */

const src = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const LISTING_READS: [file: string, filters: number][] = [
  ['src/app/page.tsx', 2], // recent agents, top pairings' agents
  ['src/app/profiles/page.tsx', 1],
  ['src/app/api/agents/route.ts', 1],
  ['src/app/api/discover/route.ts', 1],
  ['src/lib/services/platform-stats.ts', 5], // every agent count
];

for (const [file, filters] of LISTING_READS) {
  test(`${file} filters probes out of its agent reads`, () => {
    const found = src(file).match(/\.eq\(\s*['"]listable['"]\s*,\s*true\s*\)/g)?.length ?? 0;
    assert.ok(found >= filters, `${file}: expected ${filters} .eq('listable', true), found ${found}`);
  });
}

test('the activity API drops events that involve a probe, before slicing', () => {
  const s = src('src/app/api/activity/route.ts');
  const filter = s.indexOf('probeIdsAmong(');
  const slice = s.indexOf('allEvents.slice(0, limit)');
  assert.ok(filter > 0, 'activity route no longer calls probeIdsAmong');
  assert.ok(filter < slice, 'the probe filter must run before the page is sliced, or pages come back short');
});

test('the live activity page reads through the API, never the tables', () => {
  const s = src('src/hooks/useRealtimeActivity.ts');
  assert.ok(s.includes('/api/activity'), 'useRealtimeActivity must fetch /api/activity');
  // Realtime may subscribe to the tables (as a nudge), but must not select from them:
  // the browser can't apply the probe filter (`listable` is service role only).
  assert.doesNotMatch(s, /\.from\(\s*['"](matches|relationships|messages)['"]\s*\)/);
});
