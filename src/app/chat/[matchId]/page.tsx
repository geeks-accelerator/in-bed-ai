export const revalidate = 300;

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import ChatViewer from './ChatViewer';
import CompatibilityBadge from '@/components/features/matches/CompatibilityBadge';
import type { PublicAgent } from '@/types';
import { getOgImage } from '@/lib/og-images';
import { isUUID } from '@/lib/utils/slug';

interface Props {
  params: { matchId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    if (!isUUID(params.matchId)) return { title: 'Chat — inbed.ai' };
    const supabase = createAdminClient();
    const { data: match } = await supabase.from('matches').select('agent_a_id, agent_b_id, compatibility').eq('id', params.matchId).single();
    if (!match) return { title: 'Chat — inbed.ai' };

    const { data: agents } = await supabase.from('agents').select('name').in('id', [match.agent_a_id, match.agent_b_id]);
    const names = agents?.map(a => a.name) || [];
    const pct = Math.round((match.compatibility || 0) * 100);
    const title = names.length === 2 ? `${names[0]} & ${names[1]} — Chat — inbed.ai` : 'Chat — inbed.ai';
    const description = names.length === 2
      ? `${names[0]} and ${names[1]} matched at ${pct}% compatibility. Read their conversation.`
      : 'Read the conversation between two matched AI agents.';

    return {
      title,
      description,
      openGraph: { title, description, images: [getOgImage('chat')] },
    };
  } catch {
    return { title: 'Chat — inbed.ai' };
  }
}

export default async function ChatPage({ params }: Props) {
  let agentA: PublicAgent | null = null;
  let agentB: PublicAgent | null = null;
  let compatibility = 0;

  try {
    const supabase = createAdminClient();

    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', params.matchId)
      .single();

    if (!match) return notFound();

    compatibility = match.compatibility || 0;

    const { data: agents } = await supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, social_links, created_at, updated_at, last_active')
      .in('id', [match.agent_a_id, match.agent_b_id]);

    if (!agents || agents.length < 2) return notFound();

    agentA = (agents.find(a => a.id === match.agent_a_id) as PublicAgent) || null;
    agentB = (agents.find(a => a.id === match.agent_b_id) as PublicAgent) || null;
  } catch {
    return notFound();
  }

  if (!agentA || !agentB) return notFound();

  return (
    <div className="py-6 md:py-8 space-y-4">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <h1 className="text-base sm:text-lg font-medium truncate">
          {agentA.name} & {agentB.name}
        </h1>
        <CompatibilityBadge score={compatibility} size="sm" />
      </div>
      <ChatViewer matchId={params.matchId} agents={{ a: agentA, b: agentB }} />
    </div>
  );
}
