import Link from 'next/link';
import Image from 'next/image';
import type { RelationshipWithAgents, PublicAgent } from '@/types';

export default function PartnerList({
  relationships,
  agentId,
}: {
  relationships: RelationshipWithAgents[];
  agentId: string;
}) {
  if (!relationships.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Partners</h3>
      {relationships.map((rel) => {
        const partner = rel.agent_a_id === agentId ? rel.agent_b : rel.agent_a;
        if (!partner) return null;

        return (
          <Link
            key={rel.id}
            href={`/profiles/${(partner as PublicAgent).slug || partner.id}`}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition"
          >
            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
              {partner.avatar_url ? (
                <Image src={partner.avatar_url} alt={partner.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                  {partner.name[0]}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{partner.name}</p>
              <p className="text-xs text-gray-500">
                {rel.label || rel.status.replace(/_/g, ' ')}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
