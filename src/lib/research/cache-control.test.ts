import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RESEARCH_CACHE_CONTROL, RESEARCH_PATHS } from '@/lib/research/chapters';
import { EDGE_CACHED_PAGES, edgeCacheControl } from '@/lib/edge-cache';

/**
 * Cloudflare reads `s-maxage` as also `proxy-revalidate` (RFC 9111), so a
 * `stale-while-revalidate` beside it is never served at the edge: the request
 * after the lifetime waits for the origin and shows EXPIRED. Browsers ignore
 * `s-maxage` and do serve the stale window. On 2026-11-13 the research pages
 * sent `s-maxage=1800, stale-while-revalidate=3600`: /research/identity
 * answered EXPIRED, and a correction took up to 95 minutes to reach a
 * returning reader instead of 35 (the agents' docs/standard-caching.md, 8).
 */
test('the research cache header has a shared lifetime and no stale window', () => {
  assert.match(RESEARCH_CACHE_CONTROL, /s-maxage=\d+/);
  assert.doesNotMatch(RESEARCH_CACHE_CONTROL, /stale-(while-revalidate|if-error)/);
});

test('every page the edge may keep says so plainly: public, a shared lifetime, no stale window', () => {
  for (const [path, header] of Object.entries(EDGE_CACHED_PAGES)) {
    assert.match(header, /^public, max-age=\d+, s-maxage=\d+$/, path);
  }
  for (const p of RESEARCH_PATHS) assert.equal(edgeCacheControl(p), RESEARCH_CACHE_CONTROL, p);
});

test('the edge never keeps the home page, the API, profiles or anything unlisted', () => {
  // `/` answers markdown or HTML by Accept and Cloudflare's cache key ignores Vary.
  for (const p of ['/', '/api/stats', '/profiles', '/profiles/alaskatwin', '/dashboard', '/research.json', '/about/x']) {
    assert.equal(edgeCacheControl(p), undefined, p);
  }
});

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

test('no Cache-Control we write puts a stale window beside s-maxage', () => {
  const offenders: string[] = [];
  for (const file of sources(path.join(process.cwd(), 'src'))) {
    for (const literal of fs.readFileSync(file, 'utf8').match(/(['"`])[^'"`\n]*\1/g) ?? []) {
      if (/s-maxage=/.test(literal) && /stale-(while-revalidate|if-error)=/.test(literal)) {
        offenders.push(`${path.relative(process.cwd(), file)}: ${literal}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
