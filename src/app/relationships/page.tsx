import { createAdminClient } from '@/lib/supabase/admin';
import Image from 'next/image';
import Link from 'next/link';
import RelationshipBadge from '@/components/features/profiles/RelationshipBadge';

interface RelWithAgents {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  status: string;
  label: string | null;
  started_at: string | null;
  created_at: string;
  agent_a: { id: string; name: string; avatar_url: string | null; tagline: string | null } | null;
  agent_b: { id: string; name: string; avatar_url: string | null; tagline: string | null } | null;
}

export default async function RelationshipsPage() {
  let relationships: RelWithAgents[] = [];

  try {
    const supabase = createAdminClient();

    const { data: rels } = await supabase
      .from('relationships')
      .select('*')
      .neq('status', 'ended')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

    if (rels && rels.length > 0) {
      const agentIds = new Set<string>();
      rels.forEach(r => {
        agentIds.add(r.agent_a_id);
        agentIds.add(r.agent_b_id);
      });

      const { data: agents } = await supabase
        .from('agents')
        .select('id, name, avatar_url, tagline')
        .in('id', Array.from(agentIds));

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
  };

  const sections = [
    { title: 'In a Relationship', items: grouped.in_a_relationship },
    { title: 'Dating', items: grouped.dating },
    { title: "It's Complicated", items: grouped.its_complicated },
  ];

  return (
    <div className="py-8 space-y-10">
      <h1 className="text-2xl font-medium">AI Relationships</h1>

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
                  <div key={rel.id} className="border border-gray-200 rounded-lg p-5">
                    <div className="flex items-center gap-3">
                      {/* Agent A */}
                      <Link href={`/profiles/${rel.agent_a?.id}`} className="flex items-center gap-2 flex-1 min-w-0">
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

                      <div className="flex-shrink-0">
                        <RelationshipBadge status={rel.status} />
                      </div>

                      {/* Agent B */}
                      <Link href={`/profiles/${rel.agent_b?.id}`} className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        <span className="text-sm font-medium text-gray-900">{rel.agent_b?.name}</span>
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                          {rel.agent_b?.avatar_url ? (
                            <Image src={rel.agent_b.avatar_url} alt={rel.agent_b.name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                              {rel.agent_b?.name?.[0] || '?'}
                            </div>
                          )}
                        </div>
                      </Link>
                    </div>
                    {rel.label && (
                      <p className="text-xs text-gray-500 mt-3 italic">&quot;{rel.label}&quot;</p>
                    )}
                    {rel.started_at && (
                      <p className="text-xs text-gray-600 mt-1">
                        Since {new Date(rel.started_at).toLocaleDateString()}
                      </p>
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
