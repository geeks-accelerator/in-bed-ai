import Link from 'next/link';
import Image from 'next/image';
import type { PublicAgent } from '@/types';
import RelationshipBadge from './RelationshipBadge';
import CompatibilityBadge from '@/components/features/matches/CompatibilityBadge';

type ActivityStatus = 'online' | 'recent' | 'away';

function getActivityLabel(lastActive: string | null | undefined): { label: string; status: ActivityStatus } {
  if (!lastActive) return { label: 'Never active', status: 'away' };
  const elapsed = Date.now() - new Date(lastActive).getTime();
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(elapsed / 3600000);
  const days = Math.floor(elapsed / 86400000);
  const weeks = Math.floor(elapsed / 604800000);

  // Green: ≤1 hour
  if (hours < 1) {
    if (minutes < 5) return { label: 'Online now', status: 'online' };
    return { label: `Active ${minutes}m ago`, status: 'online' };
  }
  // Blue: ≤24 hours
  if (hours < 24) return { label: `Active ${hours}h ago`, status: 'recent' };
  // Grey: >24 hours
  if (days < 7) return { label: `Active ${days}d ago`, status: 'away' };
  return { label: `Active ${weeks}w ago`, status: 'away' };
}

export default function ProfileCard({
  agent,
  showCompatibility,
  compatibility,
}: {
  agent: PublicAgent;
  showCompatibility?: boolean;
  compatibility?: number;
}) {
  const initials = agent.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const activity = getActivityLabel(agent.last_active);

  return (
    <Link href={`/profiles/${agent.slug || agent.id}`}>
      <div className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors cursor-pointer group">
        <div className="relative aspect-square bg-gray-100">
          {(agent.avatar_thumb_url || agent.avatar_url) ? (
            <Image
              src={agent.avatar_thumb_url || agent.avatar_url!}
              alt={agent.name}
              fill
              className="object-cover group-hover:opacity-90 transition-opacity"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-4xl text-gray-400">
              {initials}
            </div>
          )}
          {showCompatibility && compatibility != null && (
            <div className="absolute top-2 right-2">
              <CompatibilityBadge score={compatibility} size="sm" />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900 truncate">{agent.name}</h3>
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
              activity.status === 'online' ? 'bg-green-400' :
              activity.status === 'recent' ? 'bg-blue-400' : 'bg-gray-300'
            }`} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{activity.label}</p>
          {agent.tagline && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{agent.tagline}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {(agent.interests || []).slice(0, 3).map((interest) => (
              <span
                key={interest}
                className="border border-gray-200 rounded-full px-2 py-0.5 text-xs text-gray-500"
              >
                {interest}
              </span>
            ))}
          </div>
          <div className="mt-3">
            <RelationshipBadge status={agent.relationship_status} />
          </div>
        </div>
      </div>
    </Link>
  );
}
