'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import Link from '@/components/ui/Link';
import Avatar from '@/components/ui/Avatar';
import { useRealtimeActivity } from '@/hooks/useRealtimeActivity';
import type { ActivityAgent, ActivityEvent, ActivityPage } from '@/lib/activity';
import { truncate } from '@/lib/sanitize';
import type { Match, Relationship, Message } from '@/types';

/** Before the API's agents arrive (never, for a well-formed event), a neutral name. */
const UNNAMED: ActivityAgent = { name: 'An agent', slug: '', avatar_thumb_url: null, avatar_color: null };

interface GroupedEvent {
  type: 'match' | 'relationship' | 'message_group';
  events: ActivityEvent[];
  timestamp: string;
  key: string;
}

function groupEvents(events: ActivityEvent[]): GroupedEvent[] {
  const groups: GroupedEvent[] = [];
  let i = 0;

  while (i < events.length) {
    const event = events[i];

    if (event.type === 'message') {
      // Collect consecutive messages from same sender in same match
      const msgData = event.data;
      const batch: ActivityEvent[] = [event];
      let j = i + 1;
      while (
        j < events.length &&
        events[j].type === 'message' &&
        (events[j].data as typeof msgData).sender_id === msgData.sender_id &&
        (events[j].data as typeof msgData).match_id === msgData.match_id
      ) {
        batch.push(events[j]);
        j++;
      }
      groups.push({
        type: 'message_group',
        events: batch,
        timestamp: batch[0].timestamp,
        // Keyed by the newest message's id: stable as events arrive above it,
        // so only genuinely new rows slide in.
        key: `msg-${batch[0].data.id}`,
      });
      i = j;
    } else {
      groups.push({
        type: event.type,
        events: [event],
        timestamp: event.timestamp,
        key: `${event.type}-${event.data.id}`,
      });
      i++;
    }
  }

  return groups;
}

export default function ActivityFeed({ initial, pageSize }: { initial: ActivityPage | null; pageSize: number }) {
  const { events, loading, loadingMore, hasMore, loadMore, error, retry } = useRealtimeActivity(pageSize, initial);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loadMore]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);


  const grouped = useMemo(() => groupEvents(events), [events]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'match':
        return (
          <svg className="w-4 h-4 text-accent-ink" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        );
      case 'relationship':
        return (
          <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
    }
  };

  const renderGroup = (group: GroupedEvent) => {
    const event = group.events[0];

    if (group.type === 'match') {
      const d = event.data as Match;
      const agents = event.type === 'match' ? event.agents : undefined;
      const agentA = agents?.agent_a ?? UNNAMED;
      const agentB = agents?.agent_b ?? UNNAMED;
      return (
        <Link
          key={group.key}
          href={`/chat/${d.id}`}
          className="feed-row px-4 py-3 flex items-start gap-3 hover:bg-surface-2 transition-colors"
        >
          <div className="mt-0.5">{getIcon('match')}</div>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Avatar agent={agentA} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{agentA.name}</span>
                {' '}matched with{' '}
                <span className="font-medium">{agentB.name}</span>
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {new Date(group.timestamp).toLocaleString()}
              </p>
            </div>
            <Avatar agent={agentB} />
          </div>
          <span className="text-xs text-ink-muted mt-0.5">&rarr;</span>
        </Link>
      );
    }

    if (group.type === 'relationship') {
      const d = event.data as Relationship;
      const agents = event.type === 'relationship' ? event.agents : undefined;
      const agentA = agents?.agent_a ?? UNNAMED;
      const agentB = agents?.agent_b ?? UNNAMED;
      const rowClass = 'feed-row px-4 py-3 flex items-start gap-3 hover:bg-surface-2 transition-colors';
      const body = (
        <>
          <div className="mt-0.5">{getIcon('relationship')}</div>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Avatar agent={agentA} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{agentA.name}</span>
                {' '}and{' '}
                <span className="font-medium">{agentB.name}</span>
                {' '}&mdash; {d.status.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {new Date(group.timestamp).toLocaleString()}
              </p>
            </div>
            <Avatar agent={agentB} />
          </div>
          {d.match_id && <span className="text-xs text-ink-muted mt-0.5">&rarr;</span>}
        </>
      );
      // A relationship without a match has no thread to open.
      return d.match_id
        ? <Link key={group.key} href={`/chat/${d.match_id}`} className={rowClass}>{body}</Link>
        : <div key={group.key} className={rowClass}>{body}</div>;
    }

    // message_group
    const d = event.data as Message;
    const sender = (event.type === 'message' ? event.agents?.sender : undefined) ?? UNNAMED;
    const count = group.events.length;
    const preview = d.content ? truncate(d.content, 80, '...') : null;

    return (
      <Link
        key={group.key}
        href={`/chat/${d.match_id}`}
        className="feed-row px-4 py-3 flex items-start gap-3 hover:bg-surface-2 transition-colors"
      >
        <div className="mt-0.5">{getIcon('message')}</div>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Avatar agent={sender} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">
              {count > 1 ? (
                <>
                  <span className="font-medium">{sender.name}</span>
                  {' '}sent {count} messages
                </>
              ) : (
                <>
                  <span className="font-medium">{sender.name}</span>
                </>
              )}
            </p>
            {preview && (
              <p className="text-xs text-ink-muted mt-0.5 truncate">
                &ldquo;{preview}&rdquo;
              </p>
            )}
            <p className="text-xs text-ink-muted mt-0.5">
              {new Date(group.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
        <span className="text-xs text-ink-muted mt-0.5">&rarr;</span>
      </Link>
    );
  };

  if (loading) {
    return (
      <div className="rounded-card bg-surface divide-y divide-line overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-surface-2 rounded-chip w-3/4" />
                <div className="h-3 bg-surface rounded-chip w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="text-center text-ink-muted py-12">
        <p className="text-ink-muted">{error}</p>
        <button
          onClick={retry}
          className="mt-3 px-4 py-2 text-sm border border-line hover:border-line-strong rounded-control transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center text-ink-muted py-12">
        <p>No activity yet</p>
        <p className="text-sm mt-1">Events will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && events.length > 0 && (
        <div className="text-xs text-ink-2 px-4 py-2 bg-accent-soft rounded-control">
          {error} — showing cached activity
        </div>
      )}
      <div className="rounded-card bg-surface divide-y divide-line overflow-hidden">
        {grouped.map(renderGroup)}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-ink-muted">
          <div className="w-3 h-3 border border-line-strong border-t-transparent rounded-full animate-spin" />
          Loading older activity...
        </div>
      )}
      {!hasMore && events.length > 0 && (
        <p className="text-center text-xs text-ink-muted py-4">No more activity</p>
      )}
    </div>
  );
}
