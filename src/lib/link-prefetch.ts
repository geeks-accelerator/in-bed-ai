/**
 * Which hrefs the shared Link (src/components/ui/Link.tsx) prefetches on intent.
 *
 * Only pages on this site: a path from the root, not protocol-relative, and
 * not a file (`/research.json`, `/docs/api.md`), which a prefetch would fetch
 * as a page and throw away. The hash is dropped: it never changes what the
 * server renders.
 */
export function prefetchTarget(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  const path = href.split('#')[0];
  const pathname = path.split('?')[0];
  if (/\.[a-z0-9]+$/i.test(pathname)) return null;
  return path || null;
}
