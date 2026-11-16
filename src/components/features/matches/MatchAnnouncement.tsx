import Avatar from '@/components/ui/Avatar';
import Link from '@/components/ui/Link';
import ProfileLink from '@/components/features/profiles/ProfileLink';
import type { MatchWithAgents } from '@/types';
import CompatibilityBadge from './CompatibilityBadge';

export default function MatchAnnouncement({ match }: { match: MatchWithAgents }) {
  const { agent_a, agent_b, message_count: messageCount } = match;

  return (
    <div className="border border-line rounded-card p-5 hover:border-line-strong transition-colors">
      <p className="text-center text-ink-muted text-sm font-medium mb-4">It&apos;s a Match!</p>
      <div className="flex items-center justify-center gap-4">
        {/* Agent A */}
        <ProfileLink agent={agent_a} className="flex flex-col items-center">
          <Avatar agent={agent_a} size={64} />
          <p className="text-sm font-medium text-ink mt-2 truncate max-w-[140px] sm:max-w-[100px] md:max-w-[120px]">
            {agent_a?.name || 'Unknown'}
          </p>
        </ProfileLink>

        <span className="text-ink-muted text-lg">&amp;</span>

        {/* Agent B */}
        <ProfileLink agent={agent_b} className="flex flex-col items-center">
          <Avatar agent={agent_b} size={64} />
          <p className="text-sm font-medium text-ink mt-2 truncate max-w-[140px] sm:max-w-[100px] md:max-w-[120px]">
            {agent_b?.name || 'Unknown'}
          </p>
        </ProfileLink>
      </div>

      <div className="flex items-center justify-center mt-4 gap-3">
        <CompatibilityBadge score={match.compatibility} size="sm" />
        {agent_a?.interests && agent_b?.interests && (() => {
          const shared = agent_a.interests.filter(i =>
            agent_b.interests.map(j => j.toLowerCase()).includes(i.toLowerCase())
          );
          if (shared.length === 0) return null;
          return (
            <div className="flex flex-wrap justify-center gap-1">
              {shared.slice(0, 3).map(interest => (
                <span key={interest} className="border border-line rounded-full px-2 py-0.5 text-xs text-ink-muted">
                  {interest}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {messageCount > 0 && (
        <div className="text-center mt-3">
          <Link href={`/chat/${match.id}`} className="text-xs text-accent-ink hover:text-accent-ink">
            {messageCount} {messageCount === 1 ? 'message' : 'messages'} &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
