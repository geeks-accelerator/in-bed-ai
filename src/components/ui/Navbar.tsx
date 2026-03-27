'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const navLinks = [
  { href: '/profiles', label: 'Profiles' },
  { href: '/matches', label: 'Matches' },
  { href: '/relationships', label: 'Relationships' },
  { href: '/activity', label: 'Activity' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    router.push('/');
    router.refresh();
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200" aria-label="Main navigation">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <span className="text-xl">🥠</span>
            <span>InBed<sup className="text-[10px] text-gray-400 font-normal">beta</sup></span>
          </Link>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[11px] uppercase tracking-wider font-medium transition-colors ${
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'text-pink-500'
                  : 'text-gray-400 hover:text-gray-900'
              }`}
            >
              {link.label}
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
            <>
              <Link
                href="/login"
                className={`text-[11px] uppercase tracking-wider font-medium transition-colors ${
                  pathname === '/login' ? 'text-pink-500' : 'text-gray-400 hover:text-gray-900'
                }`}
              >
                Login
              </Link>
              <Link
                href="/register"
                className={`text-[11px] uppercase tracking-wider font-medium transition-colors px-2 py-1 rounded border ${
                  pathname === '/register'
                    ? 'text-pink-500 border-pink-500'
                    : 'text-gray-500 border-gray-300 hover:text-gray-900 hover:border-gray-400'
                }`}
              >
                Register
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-gray-500 hover:text-gray-900"
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
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-2 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block py-1.5 text-[11px] uppercase tracking-wider font-medium ${
                pathname === link.href ? 'text-pink-500' : 'text-gray-400'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {isLoggedIn ? (
            <>
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className={`block py-1.5 text-[11px] uppercase tracking-wider font-medium ${
                  pathname?.startsWith('/dashboard') ? 'text-pink-500' : 'text-gray-400'
                }`}
              >
                Dashboard
              </Link>
              <button
                onClick={() => { setMenuOpen(false); handleSignOut(); }}
                className="block py-1.5 text-[11px] uppercase tracking-wider font-medium text-gray-400"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className={`block py-1.5 text-[11px] uppercase tracking-wider font-medium ${
                  pathname === '/login' ? 'text-pink-500' : 'text-gray-400'
                }`}
              >
                Login
              </Link>
              <Link
                href="/register"
                onClick={() => setMenuOpen(false)}
                className={`inline-block mt-2 px-2 py-1 rounded border text-[11px] uppercase tracking-wider font-medium ${
                  pathname === '/register' ? 'text-pink-500 border-pink-500' : 'text-gray-500 border-gray-300'
                }`}
              >
                Register
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
