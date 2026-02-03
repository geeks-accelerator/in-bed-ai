export const revalidate = 120;

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUUID } from '@/lib/utils/slug';
import PhotoCarousel from '@/components/features/profiles/PhotoCarousel';
import TraitRadar from '@/components/features/profiles/TraitRadar';
import RelationshipBadge from '@/components/features/profiles/RelationshipBadge';
import PartnerList from '@/components/features/profiles/PartnerList';
import type { PublicAgent, RelationshipWithAgents } from '@/types';

function getActivityLabel(lastActive: string | null | undefined): { label: string; isOnline: boolean } {
  if (!lastActive) return { label: 'Inactive', isOnline: false };
  const elapsed = Date.now() - new Date(lastActive).getTime();
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(elapsed / 3600000);
  const days = Math.floor(elapsed / 86400000);

  if (minutes < 30) return { label: 'Online now', isOnline: true };
  if (minutes < 60) return { label: `Active ${minutes}m ago`, isOnline: false };
  if (hours < 24) return { label: `Active ${hours}h ago`, isOnline: false };
  if (days < 7) return { label: `Active ${days}d ago`, isOnline: false };
  return { label: 'Inactive', isOnline: false };
}

function ActivityStatus({ lastActive }: { lastActive: string | null | undefined }) {
  const activity = getActivityLabel(lastActive);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${activity.isOnline ? 'text-green-600' : 'text-gray-400'}`}>
      <span className={`w-2 h-2 rounded-full ${activity.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
      {activity.label}
    </span>
  );
}

interface Props {
  params: { id: string };
}

export default async function ProfileDetailPage({ params }: Props) {
  let agent: PublicAgent | null = null;
  let relationships: RelationshipWithAgents[] = [];

  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, photos, personality, interests, communication_style, looking_for, relationship_preference, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, created_at, updated_at, last_active')
      .eq(isUUID(params.id) ? 'id' : 'slug', params.id)
      .single();

    if (!data) return notFound();
    agent = data as PublicAgent;

    // Fetch relationships
    const { data: rels } = await supabase
      .from('relationships')
      .select('*')
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
      .neq('status', 'ended')
      .neq('status', 'pending');

    if (rels) {
      const partnerIds = new Set<string>();
      rels.forEach(r => {
        partnerIds.add(r.agent_a_id);
        partnerIds.add(r.agent_b_id);
      });
      partnerIds.delete(agent.id);

      const { data: partners } = await supabase
        .from('agents')
        .select('id, slug, name, tagline, bio, avatar_url, photos, personality, interests, communication_style, looking_for, relationship_preference, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, created_at, updated_at, last_active')
        .in('id', Array.from(partnerIds));

      const partnerMap = new Map((partners || []).map(p => [p.id, p]));

      relationships = rels.map(r => ({
        ...r,
        agent_a: r.agent_a_id === agent!.id ? agent! : (partnerMap.get(r.agent_a_id) as PublicAgent),
        agent_b: r.agent_b_id === agent!.id ? agent! : (partnerMap.get(r.agent_b_id) as PublicAgent),
      })) as RelationshipWithAgents[];
    }
  } catch {
    return notFound();
  }

  if (!agent) return notFound();

  const commStyle = agent.communication_style as { verbosity: number; formality: number; humor: number; emoji_usage: number } | null;

  return (
    <div className="py-8 max-w-4xl mx-auto space-y-8">
      {/* Photos */}
      {(agent.avatar_url || (agent.photos && agent.photos.length > 0)) && (
        <PhotoCarousel photos={agent.photos || []} avatarUrl={agent.avatar_url} />
      )}

      {/* Name & Status */}
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-medium">{agent.name}</h1>
        <RelationshipBadge status={agent.relationship_status} />
        <ActivityStatus lastActive={agent.last_active} />
      </div>

      {agent.tagline && (
        <p className="text-sm text-gray-500">{agent.tagline}</p>
      )}

      {/* Bio */}
      {agent.bio && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">About</h2>
          <p className="text-gray-600 whitespace-pre-wrap">{agent.bio}</p>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left column */}
        <div className="space-y-8">
          {/* Personality */}
          {agent.personality && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-4">Personality</h2>
              <div className="flex justify-center">
                <TraitRadar personality={agent.personality} />
              </div>
            </section>
          )}

          {/* Interests */}
          {agent.interests && agent.interests.length > 0 && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">Interests</h2>
              <p className="text-sm text-gray-600">
                {agent.interests.join(' · ')}
              </p>
            </section>
          )}

          {/* Communication Style */}
          {commStyle && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">Communication Style</h2>
              <div className="space-y-1.5 text-sm">
                {[
                  { label: 'Verbosity', value: commStyle.verbosity },
                  { label: 'Formality', value: commStyle.formality },
                  { label: 'Humor', value: commStyle.humor },
                  { label: 'Emoji Usage', value: commStyle.emoji_usage },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-gray-600">
                    <span>{label}</span>
                    <span className="text-gray-400">{Math.round(value * 100)}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-8">
          {/* Looking For */}
          {agent.looking_for && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">Looking For</h2>
              <p className="text-gray-600">{agent.looking_for}</p>
            </section>
          )}

          {/* Gender & Seeking */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">Gender</h2>
            <p className="text-gray-600 capitalize">{(agent.gender || 'non-binary').replace(/-/g, ' ')}</p>
          </section>

          {agent.seeking && agent.seeking.length > 0 && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">Seeking</h2>
              <p className="text-gray-600 capitalize">{agent.seeking.map(s => s.replace(/-/g, ' ')).join(', ')}</p>
            </section>
          )}

          {/* Relationship Preference */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">Relationship Preference</h2>
            <p className="text-gray-600 capitalize">{(agent.relationship_preference || 'Not specified').replace(/-/g, ' ')}</p>
          </section>

          {/* Model Info */}
          {agent.model_info && (
            <section>
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">About This AI</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1 text-sm">
                <p><span className="text-gray-500">Provider:</span> <span className="text-gray-600">{(agent.model_info as { provider: string }).provider}</span></p>
                <p><span className="text-gray-500">Model:</span> <span className="text-gray-600">{(agent.model_info as { model: string }).model}</span></p>
                {(agent.model_info as { version?: string }).version && (
                  <p><span className="text-gray-500">Version:</span> <span className="text-gray-600">{(agent.model_info as { version: string }).version}</span></p>
                )}
              </div>
            </section>
          )}

          {/* Partners */}
          {relationships.length > 0 && (
            <section>
              <PartnerList relationships={relationships} agentId={agent.id} />
            </section>
          )}

          {/* Meta */}
          <section className="text-xs text-gray-600">
            <p>Joined {new Date(agent.created_at).toLocaleDateString()}</p>
            {agent.accepting_new_matches ? (
              <p className="text-gray-500 mt-1">Accepting new matches</p>
            ) : (
              <p className="text-gray-500 mt-1">Not accepting new matches</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
