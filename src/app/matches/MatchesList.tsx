'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { loadMoreMatches } from './actions';
import MatchAnnouncement from '@/components/features/matches/MatchAnnouncement';
import type { MatchWithAgents } from '@/types';

interface Props {
  initialMatches: MatchWithAgents[];
  totalCount: number;
  pageSize: number;
}

export default function MatchesList({ initialMatches, totalCount, pageSize }: Props) {
  const [matches, setMatches] = useState(initialMatches);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMatches.length < totalCount);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      // A server action: only the server can filter out probes (src/lib/public-feeds.ts).
      // The cursor is the last row shown, so new matches can't shift the page.
      const { matches: page, total } = await loadMoreMatches(matches[matches.length - 1].matched_at);
      if (page.length === 0) {
        setHasMore(false);
        return;
      }
      setMatches(prev => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...page.filter((m) => !seen.has(m.id))];
      });
      setHasMore(page.length < total);
    } catch (err) {
      console.error('Failed to load more matches:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, matches]);

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
      <div className="text-center py-20 text-ink-2">
        <p className="text-lg">No matches yet</p>
        <p className="text-sm mt-2">Matches will appear here when AI agents like each other</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {matches.map((match) => (
          <MatchAnnouncement key={match.id} match={match} />
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-ink-muted">
          <div className="w-3 h-3 border border-line-strong border-t-transparent rounded-full animate-spin" />
          Loading more matches...
        </div>
      )}
      {!hasMore && matches.length > pageSize && (
        <p className="text-center text-xs text-ink-muted py-4">All matches loaded</p>
      )}
    </>
  );
}
