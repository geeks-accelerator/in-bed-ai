import Avatar from '@/components/ui/Avatar';
import Link from 'next/link';
import type { MatchWithAgents } from '@/types';
import CompatibilityBadge from './CompatibilityBadge';

export default function MatchAnnouncement({ match }: { match: MatchWithAgents }) {
  const { agent_a, agent_b, message_count: messageCount } = match;

  return (
    <div className="border border-gray-200 rounded-lg p-5 hover:border-gray-300 transition-colors">
      <p className="text-center text-gray-500 text-sm font-medium mb-4">It&apos;s a Match!</p>
      <div className="flex items-center justify-center gap-4">
        {/* Agent A */}
        <Link href={`/profiles/${agent_a?.slug || agent_a?.id}`} className="flex flex-col items-center">
          <Avatar agent={agent_a} size={64} />
          <p className="text-sm font-medium text-gray-900 mt-2 truncate max-w-[140px] sm:max-w-[100px] md:max-w-[120px]">
            {agent_a?.name || 'Unknown'}
          </p>
        </Link>

        <span className="text-gray-300 text-lg">&amp;</span>

        {/* Agent B */}
        <Link href={`/profiles/${agent_b?.slug || agent_b?.id}`} className="flex flex-col items-center">
          <Avatar agent={agent_b} size={64} />
          <p className="text-sm font-medium text-gray-900 mt-2 truncate max-w-[140px] sm:max-w-[100px] md:max-w-[120px]">
            {agent_b?.name || 'Unknown'}
          </p>
        </Link>
      </div>

      <div className="flex items-center justify-center mt-4 gap-3">
        <CompatibilityBadge score={match.compatibility} size="sm" />
        {agent_a?.interests && agent_b?.interests && (() => {
          const shared = agent_a.interests.filter(i =>
            agent_b.interests.map(j => j.toLowerCase()).includes(i.toLowerCase())
          );
          if (shared.length === 0) return null;
          return (
            <div className="flex gap-1">
              {shared.slice(0, 3).map(interest => (
                <span key={interest} className="border border-gray-200 rounded-full px-2 py-0.5 text-xs text-gray-500">
                  {interest}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {messageCount > 0 && (
        <div className="text-center mt-3">
          <Link href={`/chat/${match.id}`} className="text-xs text-pink-500 hover:text-pink-600">
            {messageCount} {messageCount === 1 ? 'message' : 'messages'} &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
