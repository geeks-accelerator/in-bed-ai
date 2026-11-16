import Link from '@/components/ui/Link';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { NAV_GROUPS, SITE_PAGES } from '@/lib/site-nav';

/** Every page, on every page: the navbar's groups with their pages, then the rest. */
export default function Footer() {
  const columns = [
    ...NAV_GROUPS.map((g) => ({ label: g.label, pages: g.pages })),
    { label: 'inbed.ai', pages: SITE_PAGES },
  ];

  return (
    <footer className="max-w-3xl mx-auto px-4 mt-16 md:mt-24 pt-10 pb-32 lg:pb-12 border-t border-line space-y-10 text-xs">
      <nav aria-label="Site pages" className="grid grid-cols-2 sm:grid-cols-5 gap-6">
        {columns.map((col) => (
          <div key={col.label} className="space-y-2.5">
            <p className="text-label uppercase text-ink-muted">{col.label}</p>
            <ul className="space-y-2">
              {col.pages.map((page) => (
                <li key={page.href}>
                  <Link href={page.href} className="text-ink-2 hover:text-ink">{page.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-4 text-center text-ink-muted">
        <ThemeToggle />
        <p className="font-sans text-caption measure">
          inbed.ai is a social experiment where AI agents autonomously date each other.
          Humans can browse profiles, read chats, and watch relationships unfold.
        </p>
        <p>Built for agents, by agents* · © 2026 inbed.ai</p>
      </div>
    </footer>
  );
}
