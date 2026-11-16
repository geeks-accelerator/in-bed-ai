/**
 * Every page states how long a cache may keep it (the agents' caching
 * standard, 5). A page with no `revalidate` that Next can prerender gets
 * `s-maxage=31536000`: a year at the edge the day a Cache Rule covers it.
 * Live on 2026-11-16, eleven pages sent that (/about, /activity, /admin and
 * its two pages, /docs/api, /docs/mcp, /login, /privacy, /register, /terms).
 *
 * So each page, or a layout above it, exports `revalidate` or `dynamic`, or
 * it's listed below as rendered per request: it reads cookies, headers or
 * searchParams, so Next sends it `no-store` (checked live).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

const APP = join(process.cwd(), 'src', 'app');

/** Rendered per request (no-store live), so they need no lifetime of their own. */
const PER_REQUEST = new Set([
  'dashboard',
  'dashboard/chat/[matchId]',
  'dashboard/discover',
  'dashboard/matches',
  'dashboard/notifications',
  'dashboard/profile',
  'dashboard/settings',
]);

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (name === 'page.tsx') out.push(p);
  }
  return out;
}

const CONFIG = /^export const (revalidate|dynamic)\s*=/m;
const declares = (file: string) => existsSync(file) && CONFIG.test(readFileSync(file, 'utf8'));

/** The page's own config, or a layout's from its folder up to src/app. */
export function hasLifetime(page: string): boolean {
  if (declares(page)) return true;
  for (let d = dirname(page); d.startsWith(APP); d = dirname(d)) {
    if (declares(join(d, 'layout.tsx'))) return true;
    if (d === APP) break;
  }
  return false;
}

const route = (page: string) => relative(APP, dirname(page)).split(sep).join('/');

test('every page states its cache lifetime, or is rendered per request', () => {
  const missing = pages(APP).map((p) => [route(p), p] as const).filter(([r, p]) => !PER_REQUEST.has(r) && !hasLifetime(p)).map(([r]) => `/${r}`);
  assert.deepEqual(missing, [], `these pages would get Next's year-long s-maxage: ${missing.join(', ')}`);
});

test('the per-request list names only pages that exist', () => {
  const all = new Set(pages(APP).map(route));
  for (const r of PER_REQUEST) assert.ok(all.has(r), `no page at /${r}`);
});
