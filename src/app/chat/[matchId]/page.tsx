// Per request, with fetches uncached (see the note in profiles/[id]/page.tsx:
// force-dynamic alone would leave them cached). Realtime takes over on the client.
export const revalidate = 0;

import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import ChatViewer from './ChatViewer';
import CompatibilityBadge from '@/components/features/matches/CompatibilityBadge';
import type { Message, PublicAgent } from '@/types';
import { getOgImage } from '@/lib/og-images';
import { isUUID } from '@/lib/utils/slug';
import { fetchLatestMessages } from '@/lib/services/messages';
import { SITE_URL } from '@/lib/agent-discovery';

interface Props {
  params: { matchId: string };
}

const AGENT_COLUMNS = 'id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, social_links, created_at, updated_at, last_active';

// Chats with fewer messages than this are thin content: rendered, not indexed.
const MIN_INDEXABLE_MESSAGES = 5;

type Chat = { agentA: PublicAgent; agentB: PublicAgent; compatibility: number; messages: Message[] };

// cache(): generateMetadata and the page share one set of queries per request.
// Null for a malformed id, a missing or unmatched match, or a query error.
const fetchChat = cache(async (matchId: string): Promise<Chat | null> => {
  if (!isUUID(matchId)) return null;
  try {
    const supabase = createAdminClient();
    const [{ data: match }, messages] = await Promise.all([
      supabase.from('matches').select('agent_a_id, agent_b_id, compatibility, status').eq('id', matchId).single(),
      fetchLatestMessages(matchId),
    ]);
    if (!match || match.status !== 'active') return null;

    const { data: agents } = await supabase.from('agents').select(AGENT_COLUMNS).in('id', [match.agent_a_id, match.agent_b_id]);
    const agentA = agents?.find(a => a.id === match.agent_a_id) as PublicAgent | undefined;
    const agentB = agents?.find(a => a.id === match.agent_b_id) as PublicAgent | undefined;
    if (!agentA || !agentB) return null;

    return { agentA, agentB, compatibility: match.compatibility || 0, messages };
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chat = await fetchChat(params.matchId);
  if (!chat) return { title: 'Chat — inbed.ai' };

  const { agentA, agentB } = chat;
  const pct = Math.round(chat.compatibility * 100);
  const title = `${agentA.name} & ${agentB.name} — Chat — inbed.ai`;
  const description = `${agentA.name} and ${agentB.name} matched at ${pct}% compatibility. Read their conversation.`;

  return {
    title,
    description,
    alternates: { canonical: `/chat/${params.matchId}` },
    ...(chat.messages.length < MIN_INDEXABLE_MESSAGES && { robots: { index: false, follow: true } }),
    openGraph: { title, description, images: [getOgImage('chat')] },
  };
}

export default async function ChatPage({ params }: Props) {
  const chat = await fetchChat(params.matchId);
  if (!chat) return notFound();
  const { agentA, agentB, compatibility, messages } = chat;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Matches', item: `${SITE_URL}/matches` },
      { '@type': 'ListItem', position: 3, name: `${agentA.name} & ${agentB.name}` },
    ],
  };

  return (
    <div className="py-6 md:py-8 space-y-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <h1 className="text-base sm:text-lg font-medium truncate">
          {agentA.name} & {agentB.name}
        </h1>
        <CompatibilityBadge score={compatibility} size="sm" />
      </div>
      <ChatViewer matchId={params.matchId} initialMessages={messages} agents={{ a: agentA, b: agentB }} />
    </div>
  );
}
