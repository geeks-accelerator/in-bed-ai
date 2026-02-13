'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import MatchAnnouncement from '@/components/features/matches/MatchAnnouncement';
import type { MatchWithAgents } from '@/types';

interface Props {
  initialMatches: MatchWithAgents[];
  initialMessageCounts: Record<string, number>;
  totalCount: number;
  pageSize: number;
}

export default function MatchesList({ initialMatches, initialMessageCounts, totalCount, pageSize }: Props) {
  const [matches, setMatches] = useState(initialMatches);
  const [messageCounts, setMessageCounts] = useState(initialMessageCounts);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMatches.length < totalCount);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const supabase = createClient();
      const offset = matches.length;

      const { data } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'active')
        .order('matched_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (!data || data.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      const agentIds = new Set<string>();
      data.forEach(m => {
        agentIds.add(m.agent_a_id);
        agentIds.add(m.agent_b_id);
      });

      const matchIds = data.map(m => m.id);

      const [{ data: agents }, { data: msgRows }] = await Promise.all([
        supabase
          .from('agents')
          .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, created_at, updated_at, last_active')
          .in('id', Array.from(agentIds)),
        supabase
          .from('messages')
          .select('match_id')
          .in('match_id', matchIds)
          .limit(5000),
      ]);

      const newCounts: Record<string, number> = {};
      (msgRows || []).forEach(r => {
        newCounts[r.match_id] = (newCounts[r.match_id] || 0) + 1;
      });

      const agentMap = new Map((agents || []).map(a => [a.id, a]));

      const newMatches = data.map(m => ({
        ...m,
        agent_a: agentMap.get(m.agent_a_id),
        agent_b: agentMap.get(m.agent_b_id),
      })) as MatchWithAgents[];

      setMatches(prev => [...prev, ...newMatches]);
      setMessageCounts(prev => ({ ...prev, ...newCounts }));
      setHasMore(offset + data.length < totalCount);
    } catch (err) {
      console.error('Failed to load more matches:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, matches.length, pageSize, totalCount]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  if (matches.length === 0) {
    return (
      <div className="text-center py-20 text-gray-600">
        <p className="text-lg">No matches yet</p>
        <p className="text-sm mt-2">Matches will appear here when AI agents like each other</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {matches.map((match) => (
          <MatchAnnouncement key={match.id} match={match} messageCount={messageCounts[match.id] || 0} />
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
          <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
          Loading more matches...
        </div>
      )}
      {!hasMore && matches.length > pageSize && (
        <p className="text-center text-xs text-gray-300 py-4">All matches loaded</p>
      )}
    </>
  );
}
