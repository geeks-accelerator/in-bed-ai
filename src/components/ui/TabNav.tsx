'use client';

import Link from '@/components/ui/Link';
import { usePathname } from 'next/navigation';
import { activeHref, activeGroup, type NavPage } from '@/lib/site-nav';

/**
 * A segmented control: the dashboard's sections, and the pages of a site
 * group. Selected is ink on the canvas "thumb"; the rest are ink-2. Inner
 * corners are concentric with the control (rounded-inner-control-1 in p-1).
 */
export default function TabNav({ tabs, label, glass = false }: { tabs: readonly NavPage[]; label: string; glass?: boolean }) {
  const pathname = usePathname();
  const current = activeHref(pathname, tabs.map((t) => t.href));

  return (
    <nav
      className={`no-scrollbar flex gap-1 rounded-control p-1 overflow-x-auto ${glass ? 'glass shadow-sm shadow-black/5' : 'bg-surface-2'}`}
      aria-label={label}
    >
      {tabs.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 text-center px-2 sm:px-3 py-1.5 text-xs rounded-inner-control-1 transition-colors whitespace-nowrap ${
              active
                ? 'bg-canvas text-ink font-semibold shadow-sm shadow-black/10'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The tabs of whichever site group the current page is in (Activity,
 * Research, For agents), rendered once by the root layout so no page has to.
 * It floats on glass, sticky just under the top bar. Single-page groups and
 * pages outside the groups get nothing.
 */
export function GroupTabs() {
  const group = activeGroup(usePathname());
  if (!group || group.pages.length < 2) return null;
  return (
    <div className="sticky top-16 z-40 pt-3 pb-2">
      <TabNav tabs={group.pages} label={`${group.label} pages`} glass />
    </div>
  );
}
