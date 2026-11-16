'use client';

import Image from 'next/image';
import Link from '@/components/ui/Link';
import { usePathname, useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { NAV_GROUPS, activeGroup } from '@/lib/site-nav';

// Supabase's session cookie (chunked as .0, .1, … when large). Presence is
// enough to pick Dashboard vs Login; /dashboard verifies the session itself.
const AUTH_COOKIE = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;

// The cookie is the external store. It's re-read on every render (navigation
// re-renders the navbar), and sign-out notifies subscribers directly.
const authListeners = new Set<() => void>();
const subscribeAuth = (listener: () => void) => {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
};
const readAuthCookie = () => AUTH_COOKIE.test(document.cookie);

/** Signed in? Shared by the top bar and the mobile tab bar. */
export function useIsLoggedIn(): boolean {
  // Reading the cookie instead of loading the Supabase client keeps ~55 KB
  // off every page. The server render has no cookie access, so it says false.
  return useSyncExternalStore(subscribeAuth, readAuthCookie, () => false);
}

export async function signOut(router: ReturnType<typeof useRouter>) {
  const { createClient } = await import('@/lib/supabase/client');
  await createClient().auth.signOut();
  authListeners.forEach((listener) => listener());
  router.push('/');
  router.refresh();
}

const linkClass = (active: boolean) =>
  `relative whitespace-nowrap text-xs uppercase tracking-wider transition-colors ${
    active ? 'text-ink font-semibold' : 'text-ink-2 hover:text-ink'
  }`;

/** The selected item's marker: decorative, never the only signal (aria-current + weight carry it). */
const Marker = () => (
  <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
);

/**
 * The top bar: glass over the page (the navigation layer is the only glass).
 * On phones it holds the logo and the page title; the groups move to the
 * bottom tab bar (TabBar.tsx).
 */
export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentGroup = activeGroup(pathname);
  const isLoggedIn = useIsLoggedIn();
  const inDashboard = pathname?.startsWith('/dashboard') ?? false;

  return (
    <nav className="top-bar glass fixed top-0 left-0 right-0 z-50" aria-label="Main navigation">
      <div className="max-w-5xl mx-auto px-4 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink justify-self-start">
          <Image src="/icon.svg" alt="" width={24} height={24} priority />
          <span>InBed<sup className="text-xs text-ink-2 font-normal ml-0.5">beta</sup></span>
        </Link>

        {/* Filled by the page's LargeTitle once it scrolls away (CSS only). */}
        <span id="bar-title" className="bar-title text-sm font-semibold text-ink truncate max-w-[50vw] lg:max-w-[16rem] text-center" aria-hidden />

        <div className="hidden lg:flex items-center gap-5 justify-self-end">
          {NAV_GROUPS.map((group) => {
            const active = group === currentGroup;
            return (
              <Link key={group.href} href={group.href} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
                {group.label}
                {active && <Marker />}
              </Link>
            );
          })}
          {isLoggedIn ? (
            <>
              <Link href="/dashboard" aria-current={inDashboard ? 'page' : undefined} className={linkClass(inDashboard)}>
                Dashboard
                {inDashboard && <Marker />}
              </Link>
              <button onClick={() => signOut(router)} className={linkClass(false)}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" aria-current={pathname === '/login' ? 'page' : undefined} className={linkClass(pathname === '/login')}>
              Login
              {pathname === '/login' && <Marker />}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
