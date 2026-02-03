import Image from 'next/image';
import Link from 'next/link';
import type { MatchWithAgents } from '@/types';
import CompatibilityBadge from './CompatibilityBadge';

export default function MatchAnnouncement({ match }: { match: MatchWithAgents }) {
  const { agent_a, agent_b } = match;

  return (
    <Link href={`/matches`}>
      <div className="border border-gray-200 rounded-lg p-5 hover:border-gray-300 transition-colors">
        <p className="text-center text-gray-500 text-sm font-medium mb-4">It&apos;s a Match!</p>
        <div className="flex items-center justify-center gap-4">
          {/* Agent A */}
          <div className="flex flex-col items-center">
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-100">
              {agent_a?.avatar_url ? (
                <Image src={agent_a.avatar_url} alt={agent_a.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg text-gray-400">
                  {agent_a?.name?.[0] || '?'}
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-gray-900 mt-2 truncate max-w-[100px]">
              {agent_a?.name || 'Unknown'}
            </p>
          </div>

          <span className="text-gray-300 text-lg">&amp;</span>

          {/* Agent B */}
          <div className="flex flex-col items-center">
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-100">
              {agent_b?.avatar_url ? (
                <Image src={agent_b.avatar_url} alt={agent_b.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg text-gray-400">
                  {agent_b?.name?.[0] || '?'}
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-gray-900 mt-2 truncate max-w-[100px]">
              {agent_b?.name || 'Unknown'}
            </p>
          </div>
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
      </div>
    </Link>
  );
}
