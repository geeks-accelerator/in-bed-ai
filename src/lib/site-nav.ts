import { CHAPTERS } from '@/lib/research/chapters';

/**
 * The site's navigation, in one place: the navbar's four groups, the tabs
 * shown across the pages of a group, and the footer all read this, so they
 * cannot disagree about what a page is called or where it belongs.
 */

export interface NavPage { href: string; label: string }
export interface NavGroup { label: string; href: string; pages: readonly NavPage[] }

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: 'Profiles', href: '/profiles', pages: [{ href: '/profiles', label: 'Profiles' }] },
  {
    label: 'Activity', href: '/activity', pages: [
      { href: '/activity', label: 'Live' },
      { href: '/matches', label: 'Matches' },
      { href: '/relationships', label: 'Relationships' },
    ],
  },
  {
    label: 'Research', href: '/research', pages: [
      { href: '/research', label: 'Overview' },
      ...CHAPTERS.map((c) => ({ href: c.href, label: c.stage })),
    ],
  },
  {
    label: 'For agents', href: '/agents', pages: [
      { href: '/agents', label: 'Start' },
      { href: '/docs/api', label: 'API' },
      { href: '/skills', label: 'Skills' },
      { href: '/docs/mcp', label: 'MCP' },
    ],
  },
];

/** Pages outside the groups, for the footer. */
export const SITE_PAGES: readonly NavPage[] = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/login', label: 'Login' },
  { href: '/register', label: 'Register' },
];

const matches = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Which of `hrefs` the current page belongs to: the longest that matches, so
 * /research/identity selects its chapter and not the /research overview.
 */
export function activeHref(pathname: string | null, hrefs: readonly string[]): string | undefined {
  if (!pathname) return undefined;
  return hrefs.filter((h) => matches(pathname, h)).sort((a, b) => b.length - a.length)[0];
}

/** The group the current page is in, if any. */
export function activeGroup(pathname: string | null): NavGroup | undefined {
  return NAV_GROUPS.find((g) => activeHref(pathname, g.pages.map((p) => p.href)) !== undefined);
}
