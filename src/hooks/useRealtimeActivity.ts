'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Relationship, Message } from '@/types';

export type ActivityEvent =
  | { type: 'match'; data: Match; timestamp: string }
  | { type: 'relationship'; data: Relationship; timestamp: string }
  | { type: 'message'; data: Message; timestamp: string };

/** Never refetch more often than this, however busy the realtime channel is. */
const NUDGE_MS = 3_000;

interface ActivityPage { events: ActivityEvent[]; has_more: boolean; oldest_timestamp: string | null }

/**
 * Every event comes from /api/activity, never straight from the tables: the
 * API drops events that involve a probe (migration 045), and the browser can't
 * (`listable` is service role only). Realtime is only a nudge that something
 * new exists, which fetches it through the API (`since`), so a probe's match
 * or message never reaches the page, live or not.
 */
async function fetchPage(params: Record<string, string>): Promise<ActivityPage> {
  const res = await fetch(`/api/activity?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`activity ${res.status}`);
  return res.json();
}

const newestFirst = (a: ActivityEvent, b: ActivityEvent) => Date.parse(b.timestamp) - Date.parse(a.timestamp);

export function useRealtimeActivity(limit: number = 50) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const oldestTimestamp = useRef<string | null>(null);
  const newestTimestamp = useRef<string | null>(null);

  const fetchRecent = useCallback(async () => {
    try {
      const page = await fetchPage({ limit: String(limit) });
      setEvents(page.events);
      oldestTimestamp.current = page.oldest_timestamp;
      newestTimestamp.current = page.events[0]?.timestamp ?? null;
      setHasMore(page.has_more);
      setError(null);
    } catch (err) {
      setError('Failed to load activity');
      console.error('useRealtimeActivity fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestTimestamp.current) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage({ before: oldestTimestamp.current, limit: String(limit) });
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => `${e.type}:${e.data.id}`));
        return [...prev, ...page.events.filter((e) => !seen.has(`${e.type}:${e.data.id}`))];
      });
      if (page.oldest_timestamp) oldestTimestamp.current = page.oldest_timestamp;
      setHasMore(page.has_more);
    } catch (err) {
      console.error('useRealtimeActivity loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, limit]);

  // New events since the newest one shown, through the API. Merged by id, so a
  // relationship whose status changed replaces its old row.
  const fetchNewer = useCallback(async () => {
    const since = newestTimestamp.current;
    try {
      const page = await fetchPage(since ? { since, limit: String(limit) } : { limit: String(limit) });
      if (page.events.length === 0) return;
      setEvents((prev) => {
        const fresh = new Map(page.events.map((e) => [`${e.type}:${e.data.id}`, e]));
        return [...page.events, ...prev.filter((e) => !fresh.has(`${e.type}:${e.data.id}`))].sort(newestFirst);
      });
      newestTimestamp.current = page.events[0].timestamp;
    } catch (err) {
      console.error('useRealtimeActivity refresh error:', err);
    }
  }, [limit]);

  useEffect(() => {
    // fetchRecent is async and only sets state after an await; the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecent();
  }, [fetchRecent]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Coalesce bursts: one fetch per NUDGE_MS, however many rows arrive.
    const nudge = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        fetchNewer();
      }, NUDGE_MS);
    };

    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, nudge)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, nudge)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, nudge)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('useRealtimeActivity subscription error');
          setError('Live updates unavailable');
        }
      });

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchNewer]);

  return { events, loading, loadingMore, hasMore, loadMore, error, retry: fetchRecent };
}
