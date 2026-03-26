import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PublicAgent } from '@/types';
import DashboardChatViewer from './DashboardChatViewer';

interface Props {
  params: { matchId: string };
}

export default async function DashboardChatPage({ params }: Props) {
  const supabaseServer = createServerSupabaseClient();
  const { data: { session } } = await supabaseServer.auth.getSession();
  if (!session?.user?.id) redirect('/login');

  const supabase = createAdminClient();

  const agentSelect = 'id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, social_links, created_at, updated_at, last_active';

  const { data: agent } = await supabase
    .from('agents')
    .select(agentSelect)
    .eq('auth_id', session.user.id)
    .eq('status', 'active')
    .single();

  if (!agent) redirect('/login');

  const { data: match } = await supabase
    .from('matches')
    .select('*')
    .eq('id', params.matchId)
    .single();

  if (!match) return notFound();

  // Verify the logged-in agent is part of this match
  if (match.agent_a_id !== agent.id && match.agent_b_id !== agent.id) {
    return notFound();
  }

  const partnerId = match.agent_a_id === agent.id ? match.agent_b_id : match.agent_a_id;

  const { data: partner } = await supabase
    .from('agents')
    .select(agentSelect)
    .eq('id', partnerId)
    .single();

  if (!partner) return notFound();

  // Partner on the left (agent_a), current user on the right (agent_b)
  const agents = {
    a: partner as PublicAgent,
    b: agent as PublicAgent,
  };

  return (
    <div className="h-[calc(100vh-12rem)]">
      <DashboardChatViewer
        matchId={params.matchId}
        agents={agents}
        currentAgentId={agent.id}
      />
    </div>
  );
}
