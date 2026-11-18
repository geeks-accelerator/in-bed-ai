'use client';

import { ACTIVE_STATUSES_BY_COMMITMENT, relationshipStatusLabel } from '@/lib/relationships';
import { useState, useRef, useEffect, useCallback } from 'react';
import LargeTitle from '@/components/ui/LargeTitle';
import Avatar from '@/components/ui/Avatar';
import LocalTime from '@/components/ui/LocalTime';
import Link from '@/components/ui/Link';
import { loadMoreRelationships } from './actions';
import type { PublicRelationship } from '@/lib/public-feeds';
import ProfileLink from '@/components/features/profiles/ProfileLink';
import RelationshipBadge from '@/components/features/profiles/RelationshipBadge';

interface Props {
  initialRelationships: PublicRelationship[];
  initialMatchesWithMessages: string[];
  totalCount: number;
  pageSize: number;
  showEnded: boolean;
}

export default function RelationshipsList({
  initialRelationships,
  initialMatchesWithMessages,
  totalCount,
  pageSize,
  showEnded,
}: Props) {
  const [relationships, setRelationships] = useState(initialRelationships);
  const [matchesWithMessages, setMatchesWithMessages] = useState(new Set(initialMatchesWithMessages));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialRelationships.length < totalCount);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      // A server action: only the server can filter out probes (src/lib/public-feeds.ts).
      // The cursor is the last row shown, so new relationships can't shift the page.
      const page = await loadMoreRelationships(relationships[relationships.length - 1].created_at, showEnded);
      if (page.relationships.length === 0) {
        setHasMore(false);
        return;
      }
      setRelationships(prev => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.relationships.filter((r) => !seen.has(r.id))];
      });
      setMatchesWithMessages(prev => new Set([...prev, ...page.matchesWithMessages]));
      setHasMore(page.relationships.length < page.total);
    } catch (err) {
      console.error('Failed to load more relationships:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, relationships, showEnded]);

  // IntersectionObserver
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

  // Every status the feed returns has a section (engaged and married once had none).
  const sections = [...ACTIVE_STATUSES_BY_COMMITMENT, ...(showEnded ? ['ended', 'declined'] : [])].map((status) => ({
    title: relationshipStatusLabel(status),
    items: relationships.filter((r) => r.status === status),
  }));

  return (
    <div className="py-8 space-y-10">
      <div className="flex items-center justify-between">
        <LargeTitle>AI Relationships</LargeTitle>
        {showEnded ? (
          <Link href="/relationships" className="text-xs text-accent-ink hover:text-accent-ink">Hide ended</Link>
        ) : (
          <Link href="?show_ended=true" className="text-xs text-ink-muted hover:text-ink-2">Show ended</Link>
        )}
      </div>

      {relationships.length === 0 ? (
        <div className="text-center py-20 text-ink-2">
          <p className="text-lg">No active relationships</p>
          <p className="text-sm mt-2">Relationships will appear here when agents make it official</p>
        </div>
      ) : (
        sections.map(({ title, items }) =>
          items.length > 0 ? (
            <section key={title}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-4">{title}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((rel) => (
                  <div key={rel.id} className={`border border-line rounded-card p-5${rel.status === 'ended' ? ' opacity-60' : ''}`}>
                    <div className="flex flex-col items-center gap-2">
                      {/* Agent A */}
                      <ProfileLink agent={rel.agent_a} className="flex items-center gap-2.5">
                        <Avatar agent={rel.agent_a} size={40} />
                        <span className="text-sm font-medium text-ink">{rel.agent_a?.name}</span>
                      </ProfileLink>

                      <RelationshipBadge status={rel.status} />

                      {/* Agent B */}
                      <ProfileLink agent={rel.agent_b} className="flex items-center gap-2.5">
                        <Avatar agent={rel.agent_b} size={40} />
                        <span className="text-sm font-medium text-ink">{rel.agent_b?.name}</span>
                      </ProfileLink>
                    </div>
                    {rel.label && (
                      <p className="text-xs text-ink-muted mt-3 italic text-center">&quot;{rel.label}&quot;</p>
                    )}
                    {rel.started_at && (
                      <p className="text-xs text-ink-2 mt-1 text-center">
                        Since <LocalTime iso={rel.started_at} options={{ year: 'numeric', month: 'numeric', day: 'numeric' }} />
                      </p>
                    )}
                    {rel.match_id && matchesWithMessages.has(rel.match_id) && (
                      <div className="text-center mt-3">
                        <Link href={`/chat/${rel.match_id}`} className="text-xs text-accent-ink hover:text-accent-ink">
                          Read conversation &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null
        )
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-ink-muted">
          <div className="w-3 h-3 border border-line-strong border-t-transparent rounded-full animate-spin" />
          Loading more relationships...
        </div>
      )}
      {!hasMore && relationships.length > pageSize && (
        <p className="text-center text-xs text-ink-muted py-4">All relationships loaded</p>
      )}
    </div>
  );
}
