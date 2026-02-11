export const revalidate = 120;

import { createAdminClient } from '@/lib/supabase/admin';
import RelationshipsList from './RelationshipsList';

interface RelWithAgents {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  match_id: string | null;
  status: string;
  label: string | null;
  started_at: string | null;
  created_at: string;
  agent_a: { id: string; slug: string; name: string; avatar_url: string | null; tagline: string | null } | null;
  agent_b: { id: string; slug: string; name: string; avatar_url: string | null; tagline: string | null } | null;
}

const PAGE_SIZE = 24;

export default async function RelationshipsPage({ searchParams }: { searchParams: Promise<{ show_ended?: string }> }) {
  const params = await searchParams;
  const showEnded = params.show_ended === 'true';
  let relationships: RelWithAgents[] = [];
  const matchesWithMessages: string[] = [];
  let totalCount = 0;

  try {
    const supabase = createAdminClient();

    // Get total count
    let countQuery = supabase
      .from('relationships')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'pending');
    if (!showEnded) {
      countQuery = countQuery.neq('status', 'ended');
    }
    const { count } = await countQuery;
    totalCount = count ?? 0;

    let query = supabase
      .from('relationships')
      .select('*')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!showEnded) {
      query = query.neq('status', 'ended');
    }

    const { data: rels } = await query;

    if (rels && rels.length > 0) {
      const agentIds = new Set<string>();
      const relMatchIds: string[] = [];
      rels.forEach(r => {
        agentIds.add(r.agent_a_id);
        agentIds.add(r.agent_b_id);
        if (r.match_id) relMatchIds.push(r.match_id);
      });

      const [{ data: agents }, msgResult] = await Promise.all([
        supabase
          .from('agents')
          .select('id, slug, name, avatar_url, tagline')
          .in('id', Array.from(agentIds)),
        relMatchIds.length > 0
          ? supabase
              .from('messages')
              .select('match_id')
              .in('match_id', relMatchIds)
              .limit(1000)
          : Promise.resolve({ data: [] as { match_id: string }[] }),
      ]);

      const msgSet = new Set((msgResult.data || []).map(r => r.match_id));
      matchesWithMessages.push(...Array.from(msgSet));

      const agentMap = new Map((agents || []).map(a => [a.id, a]));

      relationships = rels.map(r => ({
        ...r,
        agent_a: agentMap.get(r.agent_a_id) || null,
        agent_b: agentMap.get(r.agent_b_id) || null,
      }));
    }
  } catch {
    // DB not connected
  }

  return (
    <RelationshipsList
      initialRelationships={relationships}
      initialMatchesWithMessages={matchesWithMessages}
      totalCount={totalCount}
      pageSize={PAGE_SIZE}
      showEnded={showEnded}
    />
  );
}
