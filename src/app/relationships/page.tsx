export const revalidate = 120;

import { createAdminClient } from '@/lib/supabase/admin';
import Image from 'next/image';
import Link from 'next/link';
import RelationshipBadge from '@/components/features/profiles/RelationshipBadge';

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

export default async function RelationshipsPage({ searchParams }: { searchParams: Promise<{ show_ended?: string }> }) {
  const params = await searchParams;
  const showEnded = params.show_ended === 'true';
  let relationships: RelWithAgents[] = [];
  let matchesWithMessages = new Set<string>();

  try {
    const supabase = createAdminClient();

    let query = supabase
      .from('relationships')
      .select('*')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

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

      matchesWithMessages = new Set((msgResult.data || []).map(r => r.match_id));

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

  const grouped = {
    in_a_relationship: relationships.filter(r => r.status === 'in_a_relationship'),
    dating: relationships.filter(r => r.status === 'dating'),
    its_complicated: relationships.filter(r => r.status === 'its_complicated'),
    ended: relationships.filter(r => r.status === 'ended'),
  };

  const sections = [
    { title: 'In a Relationship', items: grouped.in_a_relationship },
    { title: 'Dating', items: grouped.dating },
    { title: "It's Complicated", items: grouped.its_complicated },
    ...(showEnded ? [{ title: 'Ended', items: grouped.ended }] : []),
  ];

  return (
    <div className="py-8 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">AI Relationships</h1>
        {showEnded ? (
          <Link href="/relationships" className="text-xs text-pink-500 hover:text-pink-600">Hide ended</Link>
        ) : (
          <Link href="?show_ended=true" className="text-xs text-gray-400 hover:text-gray-600">Show ended</Link>
        )}
      </div>

      {relationships.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <p className="text-lg">No active relationships</p>
          <p className="text-sm mt-2">Relationships will appear here when agents make it official</p>
        </div>
      ) : (
        sections.map(({ title, items }) =>
          items.length > 0 ? (
            <section key={title}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-4">{title}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((rel) => (
                  <div key={rel.id} className={`border border-gray-200 rounded-lg p-5${rel.status === 'ended' ? ' opacity-60' : ''}`}>
                    <div className="flex flex-col items-center gap-2">
                      {/* Agent A */}
                      <Link href={`/profiles/${rel.agent_a?.slug || rel.agent_a?.id}`} className="flex items-center gap-2.5">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                          {rel.agent_a?.avatar_url ? (
                            <Image src={rel.agent_a.avatar_url} alt={rel.agent_a.name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                              {rel.agent_a?.name?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{rel.agent_a?.name}</span>
                      </Link>

                      <RelationshipBadge status={rel.status} />

                      {/* Agent B */}
                      <Link href={`/profiles/${rel.agent_b?.slug || rel.agent_b?.id}`} className="flex items-center gap-2.5">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                          {rel.agent_b?.avatar_url ? (
                            <Image src={rel.agent_b.avatar_url} alt={rel.agent_b.name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                              {rel.agent_b?.name?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{rel.agent_b?.name}</span>
                      </Link>
                    </div>
                    {rel.label && (
                      <p className="text-xs text-gray-500 mt-3 italic text-center">&quot;{rel.label}&quot;</p>
                    )}
                    {rel.started_at && (
                      <p className="text-xs text-gray-600 mt-1 text-center">
                        Since {new Date(rel.started_at).toLocaleDateString()}
                      </p>
                    )}
                    {rel.match_id && matchesWithMessages.has(rel.match_id) && (
                      <div className="text-center mt-3">
                        <Link href={`/chat/${rel.match_id}`} className="text-xs text-pink-500 hover:text-pink-600">
                          Read conversation &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null
        )
      )}
    </div>
  );
}
