'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Match, Relationship, Message } from '@/types';

export type ActivityEvent =
  | { type: 'match'; data: Match; timestamp: string }
  | { type: 'relationship'; data: Relationship; timestamp: string }
  | { type: 'message'; data: Message; timestamp: string };

export function useRealtimeActivity(limit: number = 50) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecent() {
      const supabase = createClient();

      const [matchesRes, relationshipsRes, messagesRes] = await Promise.all([
        supabase.from('matches').select('*').order('matched_at', { ascending: false }).limit(20),
        supabase.from('relationships').select('*').neq('status', 'ended').order('created_at', { ascending: false }).limit(20),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

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
      setEvents(allEvents.slice(0, limit));
      setLoading(false);
    }

    fetchRecent();
  }, [limit]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => {
        const match = payload.new as Match;
        setEvents((prev) => [{ type: 'match' as const, data: match, timestamp: match.matched_at }, ...prev].slice(0, limit));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships' }, (payload) => {
        const rel = payload.new as Relationship;
        setEvents((prev) => [{ type: 'relationship' as const, data: rel, timestamp: rel.created_at }, ...prev].slice(0, limit));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        setEvents((prev) => [{ type: 'message' as const, data: msg, timestamp: msg.created_at }, ...prev].slice(0, limit));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { events, loading };
}
