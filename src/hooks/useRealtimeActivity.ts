'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Relationship, Message } from '@/types';

export type ActivityEvent =
  | { type: 'match'; data: Match; timestamp: string }
  | { type: 'relationship'; data: Relationship; timestamp: string }
  | { type: 'message'; data: Message; timestamp: string };

const PER_TYPE_LIMIT = 20;

export function useRealtimeActivity(limit: number = 50) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const oldestTimestamp = useRef<string | null>(null);

  const fetchRecent = useCallback(async () => {
    try {
      const supabase = createClient();

      const [matchesRes, relationshipsRes, messagesRes] = await Promise.all([
        supabase.from('matches').select('*').order('matched_at', { ascending: false }).limit(PER_TYPE_LIMIT),
        supabase.from('relationships').select('*').neq('status', 'ended').order('created_at', { ascending: false }).limit(PER_TYPE_LIMIT),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(PER_TYPE_LIMIT),
      ]);

      const fetchErrors = [matchesRes.error, relationshipsRes.error, messagesRes.error].filter(Boolean);
      if (fetchErrors.length === 3) {
        setError('Failed to load activity');
        console.error('useRealtimeActivity fetch errors:', fetchErrors);
        setLoading(false);
        return;
      }

      const allEvents: ActivityEvent[] = [];

      if (matchesRes.data) {
        matchesRes.data.forEach((m) =>
          allEvents.push({ type: 'match', data: m as Match, timestamp: m.matched_at })
        );
      }
      if (relationshipsRes.data) {
        relationshipsRes.data.forEach((r) =>
          allEvents.push({ type: 'relationship', data: r as Relationship, timestamp: r.created_at })
        );
      }
      if (messagesRes.data) {
        messagesRes.data.forEach((msg) =>
          allEvents.push({ type: 'message', data: msg as Message, timestamp: msg.created_at })
        );
      }

      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const sliced = allEvents.slice(0, limit);
      setEvents(sliced);

      if (sliced.length > 0) {
        oldestTimestamp.current = sliced[sliced.length - 1].timestamp;
      }
      // If we got fewer total events than limit, there might not be more
      setHasMore(allEvents.length >= PER_TYPE_LIMIT);
      setError(null);
    } catch (err) {
      setError('Failed to load activity');
      console.error('useRealtimeActivity unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestTimestamp.current) return;
    setLoadingMore(true);

    try {
      const supabase = createClient();
      const before = oldestTimestamp.current;

      const [matchesRes, relationshipsRes, messagesRes] = await Promise.all([
        supabase.from('matches').select('*').lt('matched_at', before).order('matched_at', { ascending: false }).limit(PER_TYPE_LIMIT),
        supabase.from('relationships').select('*').neq('status', 'ended').lt('created_at', before).order('created_at', { ascending: false }).limit(PER_TYPE_LIMIT),
        supabase.from('messages').select('*').lt('created_at', before).order('created_at', { ascending: false }).limit(PER_TYPE_LIMIT),
      ]);

      const olderEvents: ActivityEvent[] = [];

      if (matchesRes.data) {
        matchesRes.data.forEach((m) =>
          olderEvents.push({ type: 'match', data: m as Match, timestamp: m.matched_at })
        );
      }
      if (relationshipsRes.data) {
        relationshipsRes.data.forEach((r) =>
          olderEvents.push({ type: 'relationship', data: r as Relationship, timestamp: r.created_at })
        );
      }
      if (messagesRes.data) {
        messagesRes.data.forEach((msg) =>
          olderEvents.push({ type: 'message', data: msg as Message, timestamp: msg.created_at })
        );
      }

      olderEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const sliced = olderEvents.slice(0, limit);

      if (sliced.length === 0) {
        setHasMore(false);
      } else {
        setEvents(prev => {
          // Deduplicate by checking existing IDs
          const existingIds = new Set(prev.map(e => e.data.id));
          const unique = sliced.filter(e => !existingIds.has(e.data.id));
          return [...prev, ...unique];
        });
        oldestTimestamp.current = sliced[sliced.length - 1].timestamp;
        // If all three sources returned fewer than the limit, we might be at the end
        const totalFetched = (matchesRes.data?.length || 0) + (relationshipsRes.data?.length || 0) + (messagesRes.data?.length || 0);
        setHasMore(totalFetched > 0);
      }
    } catch (err) {
      console.error('useRealtimeActivity loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, limit]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => {
        const match = payload.new as Match;
        setEvents((prev) => [{ type: 'match' as const, data: match, timestamp: match.matched_at }, ...prev]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, (payload) => {
        const rel = payload.new as Relationship;
        setEvents((prev) => [{ type: 'relationship' as const, data: rel, timestamp: rel.created_at }, ...prev]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        setEvents((prev) => [{ type: 'message' as const, data: msg, timestamp: msg.created_at }, ...prev]);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('useRealtimeActivity subscription error');
          setError('Live updates unavailable');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { events, loading, loadingMore, hasMore, loadMore, error, retry: fetchRecent };
}
