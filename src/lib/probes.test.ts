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
  ['src/app/page.tsx', 1], // recent agents (top pairings filter in the pair read, below)
  ['src/app/profiles/page.tsx', 1],
  ['src/app/api/agents/route.ts', 1],
  ['src/app/api/discover/route.ts', 1],
  ['src/lib/services/platform-stats.ts', 6], // every agent count, and the weekly new-agents sparkline
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

// The match and relationship feeds filter both agents of each pair in the query
// (an inner-joined embed on `listable`), so counts and offsets are of what is shown.
const PAIR_READS: [file: string, reads: number][] = [
  ['src/lib/public-feeds.ts', 2], // /matches and /relationships, page and load-more
  ['src/app/page.tsx', 1], // the home page's top pairings
  ['src/app/api/matches/route.ts', 1], // the unauthenticated listing
  ['src/app/api/relationships/route.ts', 2], // the listing and its popular labels
];

for (const [file, reads] of PAIR_READS) {
  test(`${file} filters probes out of its pair reads`, () => {
    const s = src(file);
    const embeds = s.match(/listablePairSelect\(\s*'(matches|relationships)'\s*\)/g)?.length ?? 0;
    const a = s.match(/\.eq\(\s*['"]a\.listable['"]\s*,\s*true\s*\)/g)?.length ?? 0;
    const b = s.match(/\.eq\(\s*['"]b\.listable['"]\s*,\s*true\s*\)/g)?.length ?? 0;
    assert.ok(embeds >= reads, `${file}: expected ${reads} listablePairSelect(...), found ${embeds}`);
    assert.ok(a >= reads && b >= reads, `${file}: each pair read needs .eq('a.listable', true) and .eq('b.listable', true)`);
  });
}

test('the match and relationship feeds load more on the server, never from the browser', () => {
  for (const file of ['src/app/matches/MatchesList.tsx', 'src/app/relationships/RelationshipsList.tsx']) {
    const s = src(file);
    assert.doesNotMatch(s, /\.from\(\s*['"]/, `${file} must not query tables: the browser can't filter probes`);
    assert.doesNotMatch(s, /createClient/, `${file} must load more through its server action`);
  }
  assert.match(src('src/app/matches/page.tsx'), /getPublicMatches\(/);
  assert.match(src('src/app/relationships/page.tsx'), /getPublicRelationships\(/);
});

test('/agents states its counts from getPlatformStats, never its own agent count', () => {
  // It once counted agents itself, probes included, and disagreed with llms.txt.
  const s = src('src/app/agents/page.tsx');
  assert.match(s, /getPlatformStats\(\)/);
  assert.doesNotMatch(s, /from\(\s*['"]agents['"]\s*\)/);
});
