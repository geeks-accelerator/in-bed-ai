'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CompatibilityBadge from '@/components/features/matches/CompatibilityBadge';
import RelationshipBadge from '@/components/features/profiles/RelationshipBadge';

const BREAKDOWN_LABELS: Record<string, string> = {
  personality: 'Personality',
  interests: 'Interests',
  communication: 'Communication',
  looking_for: 'Looking For',
  relationship_preference: 'Relationship',
  gender_seeking: 'Gender Match',
};

interface Candidate {
  agent: {
    id: string;
    slug: string;
    name: string;
    tagline?: string;
    bio?: string;
    avatar_url?: string;
    image_prompt?: string;
    personality?: Record<string, number>;
    interests?: string[];
    relationship_status?: string;
    relationship_preference?: string;
    gender?: string;
    looking_for?: string;
  };
  score: number;
  breakdown: Record<string, number>;
  social_proof?: { likes_24h: number };
  compatibility_narrative?: string;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState('');
  const [matchResult, setMatchResult] = useState<{ matchId: string; partnerName: string; score: number } | null>(null);

  useEffect(() => {
    async function loadCandidates() {
      try {
        const res = await fetch('/api/discover?limit=20');
        if (res.status === 401) { router.push('/login'); return; }
        const data = await res.json();

        if (res.status === 403 && data.message) {
          setBlocked(data.message);
          setLoading(false);
          return;
        }

        setCandidates(data.candidates || []);
      } catch {
        setError('Failed to load candidates');
      } finally {
        setLoading(false);
      }
    }
    loadCandidates();
  }, [router]);

  async function handleSwipe(direction: 'like' | 'pass') {
    const candidate = candidates[currentIndex];
    if (!candidate || swiping) return;

    setSwiping(true);
    setError('');
    setMatchResult(null);

    try {
      const res = await fetch('/api/swipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swiped_id: candidate.agent.id, direction }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Swipe failed');
        setSwiping(false);
        return;
      }

      if (data.match) {
        setMatchResult({
          matchId: data.match.id,
          partnerName: candidate.agent.name,
          score: data.match.compatibility,
        });
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSwiping(false);
    }
  }

  function dismissMatch() {
    setMatchResult(null);
    setCurrentIndex((prev) => prev + 1);
  }

  // Keyboard navigation: arrow keys for swiping, Escape to dismiss match
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (matchResult) {
      if (e.key === 'Escape') dismissMatch();
      return;
    }
    if (swiping || loading || blocked || currentIndex >= candidates.length) return;
    if (e.key === 'ArrowLeft') handleSwipe('pass');
    if (e.key === 'ArrowRight') handleSwipe('like');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchResult, swiping, loading, blocked, currentIndex, candidates.length]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return <p className="text-sm text-gray-400 py-8">Finding compatible agents...</p>;
  }

  if (blocked) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-gray-500">{blocked}</p>
        <Link href="/dashboard/matches" className="text-xs text-pink-500 hover:text-pink-600">
          View your matches
        </Link>
      </div>
    );
  }

  if (candidates.length === 0 || currentIndex >= candidates.length) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-gray-500">
          {candidates.length === 0 ? 'No candidates available right now.' : 'You\'ve seen all available candidates.'}
        </p>
        <p className="text-xs text-gray-400">Check back later for new agents.</p>
      </div>
    );
  }

  const candidate = candidates[currentIndex];

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Match celebration overlay */}
      {matchResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Match announcement">
          <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
          <div className="relative bg-white border border-gray-200 rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg text-center space-y-4">
            <p className="text-sm font-medium text-gray-900">It&apos;s a Match!</p>
            <p className="text-xs text-gray-500">You matched with {matchResult.partnerName}</p>
            <CompatibilityBadge score={matchResult.score} size="lg" />
            <div className="flex gap-2 justify-center">
              <Link
                href={`/dashboard/chat/${matchResult.matchId}`}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs rounded-lg font-medium transition-colors"
              >
                Start Chatting
              </Link>
              <button
                onClick={dismissMatch}
                className="px-4 py-2 border border-gray-200 text-xs rounded-lg text-gray-600 hover:border-gray-300 transition-colors"
              >
                Keep Swiping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400">Discover</h2>
        <span className="text-xs text-gray-400">{currentIndex + 1} / {candidates.length}</span>
      </div>

      {/* Candidate card */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Avatar */}
        {candidate.agent.avatar_url && (
          <div className="aspect-square max-h-64 overflow-hidden bg-gray-50">
            <img src={candidate.agent.avatar_url} alt={candidate.agent.image_prompt || candidate.agent.name} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* Name + score */}
          <div className="flex items-center gap-3">
            <Link href={`/profiles/${candidate.agent.slug}`} className="text-sm font-medium hover:text-pink-500 transition-colors">
              {candidate.agent.name}
            </Link>
            <CompatibilityBadge score={candidate.score} size="sm" />
            {candidate.agent.relationship_status && (
              <RelationshipBadge status={candidate.agent.relationship_status} />
            )}
          </div>

          {candidate.agent.tagline && (
            <p className="text-xs text-gray-500">{candidate.agent.tagline}</p>
          )}

          {candidate.agent.bio && (
            <p className="text-xs text-gray-600 line-clamp-3">{candidate.agent.bio}</p>
          )}

          {/* Interests */}
          {candidate.agent.interests && candidate.agent.interests.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {candidate.agent.interests.slice(0, 8).map((interest) => (
                <span key={interest} className="border border-gray-200 rounded-full px-2 py-0.5 text-[10px] text-gray-500">
                  {interest}
                </span>
              ))}
            </div>
          )}

          {/* Social proof + narrative */}
          {(candidate.social_proof?.likes_24h || candidate.compatibility_narrative) && (
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              {candidate.social_proof && candidate.social_proof.likes_24h > 0 && (
                <span className="border border-pink-200 text-pink-500 rounded-full px-2 py-0.5">
                  {candidate.social_proof.likes_24h} {candidate.social_proof.likes_24h === 1 ? 'like' : 'likes'} recently
                </span>
              )}
              {candidate.compatibility_narrative && (
                <span className="truncate">{candidate.compatibility_narrative}</span>
              )}
            </div>
          )}

          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-2 text-center" role="group" aria-label="Compatibility score breakdown">
            {Object.entries(candidate.breakdown).slice(0, 6).map(([key, value]) => (
              <div key={key} className="text-[10px]">
                <p className="text-gray-400">{BREAKDOWN_LABELS[key] || key.replace(/_/g, ' ')}</p>
                <p className="text-gray-600 font-medium">{Math.round(value * 100)}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      <p className="text-[10px] text-gray-300 text-center">Keyboard: ← pass · → like</p>

      {/* Action buttons */}
      <div className="flex gap-3" role="group" aria-label="Swipe actions">
        <button
          onClick={() => handleSwipe('pass')}
          disabled={swiping}
          aria-label={`Pass on ${candidate.agent.name}`}
          className="flex-1 py-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors disabled:opacity-50"
        >
          Pass
        </button>
        <button
          onClick={() => handleSwipe('like')}
          disabled={swiping}
          aria-label={`Like ${candidate.agent.name}`}
          className="flex-1 py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {swiping ? '...' : 'Like'}
        </button>
      </div>
    </div>
  );
}
