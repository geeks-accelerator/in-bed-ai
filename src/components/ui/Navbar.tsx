'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { NAV_GROUPS, activeGroup, activeHref } from '@/lib/site-nav';

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

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentGroup = activeGroup(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  // Reading the cookie instead of loading the Supabase client keeps ~55 KB
  // off every page. The server render has no cookie access, so it says false.
  const isLoggedIn = useSyncExternalStore(subscribeAuth, readAuthCookie, () => false);

  async function handleSignOut() {
    const { createClient } = await import('@/lib/supabase/client');
    await createClient().auth.signOut();
    authListeners.forEach((listener) => listener());
    router.push('/');
    router.refresh();
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200" aria-label="Main navigation">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Image src="/icon.svg" alt="" width={24} height={24} priority />
            <span>InBed<sup className="text-[10px] text-gray-400 font-normal">beta</sup></span>
          </Link>
        </div>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-3">
          {NAV_GROUPS.map((group) => (
            <Link
              key={group.href}
              href={group.href}
              aria-current={group === currentGroup ? 'page' : undefined}
              className={`text-[11px] uppercase tracking-wider font-medium transition-colors ${
                group === currentGroup ? 'text-pink-500' : 'text-gray-400 hover:text-gray-900'
              }`}
            >
              {group.label}
            </Link>
          ))}
          {isLoggedIn ? (
            <>
              <Link
                href="/dashboard"
                className={`text-[11px] uppercase tracking-wider font-medium transition-colors px-2 py-1 rounded border ${
                  pathname?.startsWith('/dashboard')
                    ? 'text-pink-500 border-pink-500'
                    : 'text-gray-500 border-gray-300 hover:text-gray-900 hover:border-gray-400'
                }`}
              >
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="text-[11px] uppercase tracking-wider font-medium text-gray-400 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className={`text-[11px] uppercase tracking-wider font-medium transition-colors ${
                pathname === '/login' ? 'text-pink-500' : 'text-gray-400 hover:text-gray-900'
              }`}
            >
              Login
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-2 -mr-2 text-gray-500 hover:text-gray-900"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-2 space-y-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.href} className="py-1">
              <Link
                href={group.href}
                onClick={() => setMenuOpen(false)}
                className={`block py-2 text-[11px] uppercase tracking-wider font-medium ${
                  group === currentGroup ? 'text-pink-500' : 'text-gray-400'
                }`}
              >
                {group.label}
              </Link>
              {group.pages.length > 1 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pl-3 pb-1">
                  {group.pages.map((page) => (
                    <Link
                      key={page.href}
                      href={page.href}
                      onClick={() => setMenuOpen(false)}
                      className={`py-1.5 text-xs ${page.href === activeHref(pathname, group.pages.map((p) => p.href)) ? 'text-gray-900' : 'text-gray-500'}`}
                    >
                      {page.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoggedIn ? (
            <>
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className={`block py-3 text-[11px] uppercase tracking-wider font-medium ${
                  pathname?.startsWith('/dashboard') ? 'text-pink-500' : 'text-gray-400'
                }`}
              >
                Dashboard
              </Link>
              <button
                onClick={() => { setMenuOpen(false); handleSignOut(); }}
                className="block py-3 text-[11px] uppercase tracking-wider font-medium text-gray-400"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className={`block py-3 text-[11px] uppercase tracking-wider font-medium ${
                pathname === '/login' ? 'text-pink-500' : 'text-gray-400'
              }`}
            >
              Login
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
