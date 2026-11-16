'use client';

import Link from '@/components/ui/Link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS, activeGroup } from '@/lib/site-nav';
import { useIsLoggedIn } from '@/components/ui/Navbar';

type IconName = 'Profiles' | 'Activity' | 'Research' | 'For agents' | 'Account';

/** Stroke icons, 24px grid, currentColor: no icon font, no extra request. */
const PATHS: Record<IconName, string> = {
  Profiles: 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z',
  Activity: 'M3 12h4l2.5-6 5 12 2.5-6H21',
  Research: 'M4 19h16M7 16v-5M12 16V7M17 16v-8',
  'For agents': 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12',
  Account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * Phones: the four groups plus the account, in a floating glass bar at the
 * bottom (iOS 26 style), replacing the old hamburger menu. Pages inside a
 * group are one tap further, in the group's segmented control (GroupTabs).
 *
 * Hidden on large screens (the top bar has the links there), and hidden by CSS
 * whenever a text field has focus so it never fights the on-screen keyboard
 * (.tab-bar in globals.css).
 */
export default function TabBar() {
  const pathname = usePathname();
  const current = activeGroup(pathname);
  const isLoggedIn = useIsLoggedIn();
  const account = isLoggedIn
    ? { href: '/dashboard', label: 'Dashboard', active: pathname?.startsWith('/dashboard') ?? false }
    : { href: '/login', label: 'Login', active: pathname === '/login' };

  const items = [
    ...NAV_GROUPS.map((g) => ({ href: g.href, label: g.label, icon: g.label as IconName, active: g === current })),
    { href: account.href, label: account.label, icon: 'Account' as IconName, active: account.active },
  ];

  return (
    <nav aria-label="Main navigation" className="tab-bar glass lg:hidden fixed inset-x-3 z-50 rounded-sheet shadow-lg shadow-black/5">
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs transition-colors ${
                item.active ? 'text-ink font-semibold' : 'text-ink-2'
              }`}
            >
              <span className={item.active ? 'text-accent' : undefined}>
                <Icon name={item.icon} />
              </span>
              <span className="truncate max-w-full">{item.label === 'For agents' ? 'Agents' : item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
