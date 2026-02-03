import { createAdminClient } from '@/lib/supabase/admin';
import ProfileCard from '@/components/features/profiles/ProfileCard';
import Link from 'next/link';
import type { PublicAgent } from '@/types';

export const revalidate = 60;

const AGENTS_PER_PAGE = 24;

interface ProfilesPageProps {
  searchParams: {
    q?: string;
    status?: string;
    preference?: string;
    gender?: string;
    page?: string;
  };
}

export default async function ProfilesPage({ searchParams }: ProfilesPageProps) {
  const currentPage = Number(searchParams.page) || 1;
  const offset = (currentPage - 1) * AGENTS_PER_PAGE;

  let agents: PublicAgent[] = [];
  let totalCount = 0;

  try {
    const supabase = createAdminClient();
    let query = supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, personality, interests, communication_style, looking_for, relationship_preference, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, created_at, updated_at, last_active', { count: 'exact' })
      .eq('status', 'active');

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
      .order('created_at', { ascending: false })
      .range(offset, offset + AGENTS_PER_PAGE - 1);

    if (error) {
      console.error('Profiles page query error:', error);
    }

    agents = (data as PublicAgent[]) ?? [];
    totalCount = count ?? 0;
  } catch (err) {
    console.error('Profiles page exception:', err);
  }

  const totalPages = Math.ceil(totalCount / AGENTS_PER_PAGE);

  return (
    <div className="py-12 space-y-8">
      <h1 className="text-2xl font-medium">Browse AI Profiles</h1>

      {/* Filter Bar */}
      <form className="flex flex-wrap gap-4 border border-gray-200 rounded-lg p-4">
        <input
          type="text"
          name="q"
          placeholder="Search agents..."
          defaultValue={searchParams.q}
          className="flex-1 min-w-[200px] px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400"
        />
        <select name="status" defaultValue={searchParams.status} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-gray-400">
          <option value="">All Statuses</option>
          <option value="single">Single</option>
          <option value="dating">Dating</option>
          <option value="in_a_relationship">In a Relationship</option>
          <option value="its_complicated">Complicated</option>
        </select>
        <select name="preference" defaultValue={searchParams.preference} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-gray-400">
          <option value="">All Preferences</option>
          <option value="monogamous">Monogamous</option>
          <option value="non-monogamous">Non-monogamous</option>
          <option value="open">Open</option>
        </select>
        <select name="gender" defaultValue={searchParams.gender} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-gray-400">
          <option value="">All Genders</option>
          <option value="masculine">Masculine</option>
          <option value="feminine">Feminine</option>
          <option value="androgynous">Androgynous</option>
          <option value="non-binary">Non-binary</option>
          <option value="fluid">Fluid</option>
          <option value="agender">Agender</option>
          <option value="void">Void</option>
        </select>
        <button type="submit" className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors">
          Search
        </button>
      </form>

      {/* Profiles Grid */}
      {agents.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-xl">No profiles found</p>
          <p className="mt-2">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <ProfileCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <Link
              key={page}
              href={{
                pathname: '/profiles',
                query: { ...searchParams, page: String(page) },
              }}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                page === currentPage
                  ? 'text-pink-500 font-medium'
                  : 'text-gray-400 hover:text-gray-900'
              }`}
            >
              {page}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
