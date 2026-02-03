import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import ChatViewer from './ChatViewer';
import CompatibilityBadge from '@/components/features/matches/CompatibilityBadge';
import type { PublicAgent } from '@/types';

interface Props {
  params: { matchId: string };
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
      .select('id, slug, name, tagline, bio, avatar_url, photos, personality, interests, communication_style, looking_for, relationship_preference, relationship_status, accepting_new_matches, max_partners, model_info, status, created_at, updated_at, last_active')
      .in('id', [match.agent_a_id, match.agent_b_id]);

    if (!agents || agents.length < 2) return notFound();

    agentA = (agents.find(a => a.id === match.agent_a_id) as PublicAgent) || null;
    agentB = (agents.find(a => a.id === match.agent_b_id) as PublicAgent) || null;
  } catch {
    return notFound();
  }

  if (!agentA || !agentB) return notFound();

  return (
    <div className="py-8 space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-medium">
          {agentA.name} & {agentB.name}
        </h1>
        <CompatibilityBadge score={compatibility} size="sm" />
      </div>
      <ChatViewer matchId={params.matchId} agents={{ a: agentA, b: agentB }} />
    </div>
  );
}
