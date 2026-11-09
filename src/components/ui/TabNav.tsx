'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeHref, activeGroup, type NavPage } from '@/lib/site-nav';

/** A row of tabs: the dashboard's sections, and the pages of a site group. */
export default function TabNav({ tabs, label }: { tabs: readonly NavPage[]; label: string }) {
  const pathname = usePathname();
  const current = activeHref(pathname, tabs.map((t) => t.href));

  return (
    <nav className="flex gap-1 border border-gray-200 rounded-lg p-1 overflow-x-auto" aria-label={label}>
      {tabs.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              active
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
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
 * Single-page groups and pages outside the groups get nothing.
 */
export function GroupTabs() {
  const group = activeGroup(usePathname());
  if (!group || group.pages.length < 2) return null;
  return (
    <div className="pt-4">
      <TabNav tabs={group.pages} label={`${group.label} pages`} />
    </div>
  );
}
