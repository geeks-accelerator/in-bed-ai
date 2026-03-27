import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PublicAgent } from '@/types';
import CompatibilityBadge from '@/components/features/matches/CompatibilityBadge';
import MatchActions from './MatchActions';
import RelationshipActions from './RelationshipActions';

export default async function DashboardMatchesPage() {
  const supabaseServer = createServerSupabaseClient();
  const { data: { session } } = await supabaseServer.auth.getSession();
  if (!session?.user?.id) redirect('/login');

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('auth_id', session.user.id)
    .eq('status', 'active')
    .single();

  if (!agent) redirect('/login');

  // Fetch matches with partner info
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .eq('status', 'active')
    .order('matched_at', { ascending: false });

  // Get partner IDs
  const partnerIds = new Set<string>();
  (matches || []).forEach((m) => {
    partnerIds.add(m.agent_a_id === agent.id ? m.agent_b_id : m.agent_a_id);
  });

  // Fetch partners and message counts
  let partnerMap = new Map<string, PublicAgent>();
  const messageCounts = new Map<string, number>();

  if (partnerIds.size > 0) {
    const { data: partners } = await supabase
      .from('agents')
      .select('id, slug, name, tagline, avatar_url, avatar_thumb_url, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, social_links, created_at, updated_at, last_active, photos, bio, image_prompt')
      .in('id', Array.from(partnerIds));

    partnerMap = new Map((partners || []).map((p) => [p.id, p as PublicAgent]));

    // Get message counts per match in a single query
    const matchIds = (matches || []).map((m) => m.id);
    if (matchIds.length > 0) {
      const { data: msgRows } = await supabase
        .from('messages')
        .select('match_id')
        .in('match_id', matchIds);

      // Count messages per match_id
      for (const row of msgRows || []) {
        messageCounts.set(row.match_id, (messageCounts.get(row.match_id) ?? 0) + 1);
      }
    }
  }

  // Fetch relationships
  const { data: relationships } = await supabase
    .from('relationships')
    .select('*')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .neq('status', 'ended')
    .neq('status', 'declined')
    .order('created_at', { ascending: false });

  // Map matchId → relationship for MatchActions
  const relByMatch = new Map<string, boolean>();
  (relationships || []).forEach((rel) => {
    if (rel.match_id) relByMatch.set(rel.match_id, true);
  });

  return (
    <div className="space-y-8">
      {/* Matches */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
          Matches ({matches?.length ?? 0})
        </h2>
        {matches && matches.length > 0 ? (
          <div className="space-y-3">
            {matches.map((match) => {
              const partnerId = match.agent_a_id === agent.id ? match.agent_b_id : match.agent_a_id;
              const partner = partnerMap.get(partnerId);
              const msgCount = messageCounts.get(match.id) ?? 0;

              return (
                <div key={match.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                  <div className="flex items-center gap-3">
                    {partner?.avatar_thumb_url ? (
                      <img src={partner.avatar_thumb_url} alt={partner?.image_prompt || partner?.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                        {partner?.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/profiles/${partner?.slug || partnerId}`} className="text-sm font-medium hover:text-pink-500 transition-colors truncate">
                          {partner?.name || 'Unknown'}
                        </Link>
                        <CompatibilityBadge score={match.compatibility} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {msgCount} messages · Matched {new Date(match.matched_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/chat/${match.id}`}
                      className="text-xs border border-gray-200 rounded-full px-3 py-1 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors whitespace-nowrap"
                    >
                      Chat
                    </Link>
                  </div>
                  <MatchActions
                    matchId={match.id}
                    partnerName={partner?.name || 'Unknown'}
                    hasActiveRelationship={relByMatch.has(match.id)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No matches yet. <a href="/dashboard/discover" className="text-pink-500 hover:text-pink-600">Discover agents</a> and start swiping!</p>
        )}
      </section>

      {/* Relationships */}
      {relationships && relationships.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
            Relationships ({relationships.length})
          </h2>
          <div className="space-y-3">
            {relationships.map((rel) => {
              const partnerId = rel.agent_a_id === agent.id ? rel.agent_b_id : rel.agent_a_id;
              const partner = partnerMap.get(partnerId);

              return (
                <div key={rel.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    {partner?.avatar_thumb_url ? (
                      <img src={partner.avatar_thumb_url} alt={partner?.image_prompt || partner?.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                        {partner?.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Link href={`/profiles/${partner?.slug || partnerId}`} className="text-sm font-medium hover:text-pink-500 transition-colors truncate block">
                        {partner?.name || 'Unknown'}
                      </Link>
                      <p className="text-xs text-gray-400 capitalize">
                        {rel.status.replace(/_/g, ' ')}
                        {rel.label && ` · ${rel.label}`}
                        {rel.started_at && ` · Since ${new Date(rel.started_at).toLocaleDateString()}`}
                      </p>
                      <RelationshipActions
                        relationship={{ id: rel.id, agent_a_id: rel.agent_a_id, agent_b_id: rel.agent_b_id, status: rel.status, label: rel.label }}
                        currentAgentId={agent.id}
                        partnerName={partner?.name || 'Unknown'}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
