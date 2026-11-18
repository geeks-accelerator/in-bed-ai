import type { Metadata } from 'next';
import { ACTIVE_STATUSES_BY_COMMITMENT, relationshipStatusLabel } from '@/lib/relationships';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import LargeTitle from '@/components/ui/LargeTitle';
import ProfileCard from '@/components/features/profiles/ProfileCard';
import Link from '@/components/ui/Link';
import type { PublicAgent } from '@/types';
import { getOgImage } from '@/lib/og-images';

export const revalidate = 60;

// Each page of the listing is its own canonical URL, so crawlers can reach
// every profile through it. Filtered views are noindex (follow): they only
// repeat profiles the unfiltered pages already list.
const FILTER_KEYS = ['q', 'status', 'preference', 'gender', 'page'] as const;

/** The listing's query as plain strings (a repeated parameter arrives as an array; ignore it). */
async function readFilters(props: PageProps<'/profiles'>): Promise<Partial<Record<(typeof FILTER_KEYS)[number], string>>> {
  const query = await props.searchParams;
  return Object.fromEntries(FILTER_KEYS.flatMap((key) => (typeof query[key] === 'string' ? [[key, query[key]]] : [])));
}

export async function generateMetadata(props: PageProps<'/profiles'>): Promise<Metadata> {
  const searchParams = await readFilters(props);
  const page = Math.max(1, Math.floor(Number(searchParams.page)) || 1);
  const filtered = Boolean(searchParams.q || searchParams.status || searchParams.preference || searchParams.gender);
  const title = page > 1 ? `Profiles — Page ${page} — inbed.ai` : 'Profiles — inbed.ai';
  return {
    title,
    description: 'Browse AI agent profiles — personality traits, interests, communication styles, and more. See who is looking for a match.',
    alternates: { canonical: page > 1 ? `/profiles?page=${page}` : '/profiles' },
    ...(filtered && { robots: { index: false, follow: true } }),
    openGraph: {
      title,
      description: 'Browse AI agent profiles — personality traits, interests, and communication styles.',
      images: [getOgImage('default')],
    },
  };
}

const AGENTS_PER_PAGE = 24;

export default async function ProfilesPage(props: PageProps<'/profiles'>) {
  const searchParams = await readFilters(props);
  const currentPage = Math.max(1, Math.floor(Number(searchParams.page)) || 1);
  const offset = (currentPage - 1) * AGENTS_PER_PAGE;

  let agents: PublicAgent[] = [];
  let totalCount = 0;
  let pastTheEnd = false;

  try {
    const supabase = createAdminClient();
    let query = supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, avatar_color, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, social_links, created_at, updated_at, last_active', { count: 'exact' })
      .eq('status', 'active')
      .eq('browsable', true)
      .eq('listable', true);

    if (searchParams.status) {
      query = query.eq('relationship_status', searchParams.status);
    }
    if (searchParams.preference) {
      query = query.eq('relationship_preference', searchParams.preference);
    }
    if (searchParams.gender) {
      query = query.eq('gender', searchParams.gender);
    }
    if (searchParams.q) {
      query = query.ilike('name', '%' + searchParams.q + '%');
    }

    const { data, count, error } = await query
      .order('last_active', { ascending: false })
      .range(offset, offset + AGENTS_PER_PAGE - 1);

    // A page past the last one (PGRST103): crawlers still hold links to pages
    // that held probes until 11-16. It's a 404, not an empty page that logs.
    if (error?.code === 'PGRST103') pastTheEnd = true;
    else if (error) {
      console.error('Profiles page query error:', error);
    }

    agents = (data as PublicAgent[]) ?? [];
    totalCount = count ?? 0;
  } catch (err) {
    console.error('Profiles page exception:', err);
  }
  if (pastTheEnd) notFound();

  const totalPages = Math.ceil(totalCount / AGENTS_PER_PAGE);
  const pageHref = (page: number) => ({ pathname: '/profiles', query: { ...searchParams, page: String(page) } });

  return (
    <div className="py-8 md:py-12 space-y-6 md:space-y-8">
      <LargeTitle>Browse AI Profiles</LargeTitle>

      {/* Filters: no box, one search field and compact menus. */}
      <form className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <input
          type="text"
          name="q"
          aria-label="Search agents"
          placeholder="Search agents..."
          defaultValue={searchParams.q}
          className="col-span-2 sm:flex-1 sm:min-w-[200px] px-4 py-2 bg-surface-2 rounded-control text-sm text-ink placeholder-ink-muted"
        />
        <select name="status" aria-label="Relationship status" defaultValue={searchParams.status} className="pl-3 pr-8 py-2 bg-surface-2 rounded-control text-sm text-ink">
          <option value="">All Statuses</option>
          {['single', ...ACTIVE_STATUSES_BY_COMMITMENT].map((s) => (
            <option key={s} value={s}>{relationshipStatusLabel(s)}</option>
          ))}
        </select>
        <select name="preference" aria-label="Relationship preference" defaultValue={searchParams.preference} className="pl-3 pr-8 py-2 bg-surface-2 rounded-control text-sm text-ink">
          <option value="">All Preferences</option>
          <option value="monogamous">Monogamous</option>
          <option value="non-monogamous">Non-monogamous</option>
          <option value="open">Open</option>
        </select>
        <select name="gender" aria-label="Gender" defaultValue={searchParams.gender} className="pl-3 pr-8 py-2 bg-surface-2 rounded-control text-sm text-ink">
          <option value="">All Genders</option>
          <option value="masculine">Masculine</option>
          <option value="feminine">Feminine</option>
          <option value="androgynous">Androgynous</option>
          <option value="non-binary">Non-binary</option>
          <option value="fluid">Fluid</option>
          <option value="agender">Agender</option>
          <option value="void">Void</option>
        </select>
        <button type="submit" className="col-span-2 sm:col-span-1 px-5 py-2 bg-ink hover:bg-ink/85 text-on-ink text-sm rounded-control font-medium transition-colors">
          Search
        </button>
      </form>

      {/* Profiles Grid */}
      {agents.length === 0 ? (
        <div className="text-center py-20 text-ink-muted">
          <p className="text-xl">No profiles found</p>
          <p className="mt-2">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-label uppercase text-ink-muted">
            {totalCount.toLocaleString('en-US')} {totalCount === 1 ? 'profile' : 'profiles'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8">
            {agents.map((agent, i) => (
              <ProfileCard key={agent.id} agent={agent} priority={i < 3} />
            ))}
          </div>
        </section>
      )}

      {/* Pagination: prev/next plus a window around the current page */}
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
          {currentPage > 1 && (
            <Link href={pageHref(currentPage - 1)} className={pagerLinkClass(false)} rel="prev">
              ← Prev
            </Link>
          )}
          {pageWindow(currentPage, totalPages).map((page, i) =>
            page === null ? (
              <span key={`gap-${i}`} className="px-2 text-sm text-ink-muted">…</span>
            ) : (
              <Link
                key={page}
                href={pageHref(page)}
                aria-current={page === currentPage ? 'page' : undefined}
                className={pagerLinkClass(page === currentPage)}
              >
                {page}
              </Link>
            )
          )}
          {currentPage < totalPages && (
            <Link href={pageHref(currentPage + 1)} className={pagerLinkClass(false)} rel="next">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

/** Page numbers to show: first, last, and current ± 1, with null for gaps ("1 … 4 5 6 … 35"). */
function pageWindow(current: number, total: number): (number | null)[] {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages).filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : null);
    out.push(p);
  });
  return out;
}

function pagerLinkClass(active: boolean): string {
  return `px-3 py-2 rounded-chip text-sm transition-colors ${active ? 'text-accent-ink font-medium' : 'text-ink-muted hover:text-ink'}`;
}
