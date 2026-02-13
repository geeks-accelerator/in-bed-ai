'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/types';

const PAGE_SIZE = 50;

export function useRealtimeMessages(matchId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oldestTimestamp = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const supabase = createClient();
      // Fetch the most recent PAGE_SIZE messages (descending), then reverse for display
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) {
        setError('Failed to load messages');
        console.error('useRealtimeMessages fetch error:', fetchError.message);
      } else if (data) {
        const sorted = [...data].reverse() as Message[];
        setMessages(sorted);
        setHasMore(data.length === PAGE_SIZE);
        if (sorted.length > 0) {
          oldestTimestamp.current = sorted[0].created_at;
        }
        setError(null);
      }
    } catch (err) {
      setError('Failed to load messages');
      console.error('useRealtimeMessages unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestTimestamp.current) return;
    setLoadingMore(true);

    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .lt('created_at', oldestTimestamp.current)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) {
        console.error('useRealtimeMessages loadMore error:', fetchError.message);
      } else if (data) {
        const sorted = [...data].reverse() as Message[];
        setMessages(prev => [...sorted, ...prev]);
        setHasMore(data.length === PAGE_SIZE);
        if (sorted.length > 0) {
          oldestTimestamp.current = sorted[0].created_at;
        }
      }
    } catch (err) {
      console.error('useRealtimeMessages loadMore unexpected error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [matchId, loadingMore, hasMore]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('useRealtimeMessages subscription error for match:', matchId);
          setError('Live updates unavailable');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  return { messages, loading, loadingMore, hasMore, loadMore, error, retry: fetchMessages };
}
