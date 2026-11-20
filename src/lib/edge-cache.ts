import { RESEARCH_CACHE_CONTROL, RESEARCH_PATHS } from '@/lib/research/chapters';

/**
 * The HTML pages Cloudflare may keep, and the `Cache-Control` each sends.
 *
 * Cloudflare caches no HTML on Next's own header (`s-maxage=…,
 * stale-while-revalidate=<a year>`): it needs the response to say plainly that
 * it may be shared, and it never serves a stale window beside `s-maxage`
 * (cache-control.test.ts). So src/proxy.ts states one of these for exactly
 * these paths, and Cloudflare's cache rule lists the same paths
 * (private/docs/guides/cloudflare-security-rules.md): change both together.
 * Adding a page here is how a page gets cached at the edge.
 *
 * Never here: `/` (it answers markdown or HTML by Accept, and Cloudflare's
 * cache key ignores Vary), anything under /api, /profiles (no-store), or a
 * page that differs by visitor.
 */

/** Pages that change at most hourly (their `revalidate` is 3600): an hour at the edge. */
export const HOURLY_PAGE_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';
/** Pages with live counts (`revalidate = 60`): a minute anywhere. */
export const MINUTE_PAGE_CACHE_CONTROL = 'public, max-age=60, s-maxage=60';

export const EDGE_CACHED_PAGES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(RESEARCH_PATHS.map((p) => [p, RESEARCH_CACHE_CONTROL])),
  '/about': HOURLY_PAGE_CACHE_CONTROL,
  '/skills': HOURLY_PAGE_CACHE_CONTROL,
  '/terms': HOURLY_PAGE_CACHE_CONTROL,
  '/privacy': HOURLY_PAGE_CACHE_CONTROL,
  '/docs/api': HOURLY_PAGE_CACHE_CONTROL,
  '/docs/mcp': HOURLY_PAGE_CACHE_CONTROL,
  '/agents': MINUTE_PAGE_CACHE_CONTROL,
  '/activity': MINUTE_PAGE_CACHE_CONTROL, // the browser then fetches what came after it
};

/** The header for a path the edge may keep, or undefined for every other path. */
export function edgeCacheControl(pathname: string): string | undefined {
  return Object.hasOwn(EDGE_CACHED_PAGES, pathname) ? EDGE_CACHED_PAGES[pathname] : undefined;
}
