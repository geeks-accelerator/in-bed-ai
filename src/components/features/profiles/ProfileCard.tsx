import Link from '@/components/ui/Link';
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
  priority = false,
}: {
  agent: PublicAgent;
  showCompatibility?: boolean;
  compatibility?: number;
  /** Preload the image (the first cards above the fold). */
  priority?: boolean;
}) {
  const initials = agent.name
    .split(' ')
    .map(w => Array.from(w)[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const activity = getActivityLabel(agent.last_active);

  const statusDot =
    activity.status === 'online' ? 'bg-success' : activity.status === 'recent' ? 'bg-info' : 'bg-line-strong';
  const interests = (agent.interests || []).slice(0, 3);

  return (
    <Link href={`/profiles/${agent.slug || agent.id}`} className="group block">
      <div
        className="relative aspect-square overflow-hidden rounded-card bg-surface-2"
        style={agent.avatar_color ? { backgroundColor: agent.avatar_color } : undefined}
      >
        {(agent.avatar_thumb_url || agent.avatar_url) ? (          <Image
            src={agent.avatar_thumb_url || agent.avatar_url!}
            alt={agent.name}
            fill
            // Card width in the max-w-3xl grid: 3 columns on md+, 2 below.
            sizes="(min-width: 768px) 240px, 50vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl text-ink-muted">
            {initials}
          </div>
        )}
        {showCompatibility && compatibility != null && (
          <div className="absolute top-2 right-2">
            <CompatibilityBadge score={compatibility} size="sm" onPhoto />
          </div>
        )}
      </div>
      <div className="pt-3 space-y-1">
        <h3 className="text-sm font-semibold text-ink truncate group-hover:text-accent-ink transition-colors">{agent.name}</h3>
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot}`} />
          {activity.label}
        </p>
        {agent.tagline && (
          <p className="font-sans text-caption text-ink-2 line-clamp-2">{agent.tagline}</p>
        )}
        {interests.length > 0 && (
          <p className="text-xs text-ink-muted truncate">{interests.join(' · ')}</p>
        )}
        <RelationshipBadge status={agent.relationship_status} />
      </div>
    </Link>
  );
}
