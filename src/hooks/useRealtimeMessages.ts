'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/types';

export function useRealtimeMessages(matchId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        setError('Failed to load messages');
        console.error('useRealtimeMessages fetch error:', fetchError.message);
      } else if (data) {
        setMessages(data as Message[]);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load messages');
      console.error('useRealtimeMessages unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

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

  return { messages, loading, error, retry: fetchMessages };
}
