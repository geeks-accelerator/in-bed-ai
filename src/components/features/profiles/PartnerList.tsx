import ProfileLink from './ProfileLink';
import Avatar from '@/components/ui/Avatar';
import type { RelationshipWithAgents } from '@/types';

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
      <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wide">Partners</h3>
      {relationships.map((rel) => {
        const partner = rel.agent_a_id === agentId ? rel.agent_b : rel.agent_a;
        if (!partner) return null;

        return (
          <ProfileLink
            key={rel.id}
            agent={partner}
            className="flex items-center gap-3 p-2 rounded-card hover:bg-surface transition"
          >
            <Avatar agent={partner} size={40} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{partner.name}</p>
              <p className="text-xs text-ink-muted">
                {rel.label || rel.status.replace(/_/g, ' ')}
              </p>
            </div>
          </ProfileLink>
        );
      })}
    </div>
  );
}
