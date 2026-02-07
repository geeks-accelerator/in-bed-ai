'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRealtimeActivity, ActivityEvent } from '@/hooks/useRealtimeActivity';
import { createClient } from '@/lib/supabase/client';

export default function ActivityFeed() {
  const { events, loading, error, retry } = useRealtimeActivity(50);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  // Fetch agent names for all IDs in events
  useEffect(() => {
    const ids = new Set<string>();
    events.forEach(e => {
      if (e.type === 'match') {
        ids.add(e.data.agent_a_id);
        ids.add(e.data.agent_b_id);
      } else if (e.type === 'relationship') {
        ids.add(e.data.agent_a_id);
        ids.add(e.data.agent_b_id);
      } else if (e.type === 'message') {
        ids.add(e.data.sender_id);
      }
    });

    const unknownIds = Array.from(ids).filter(id => !agentNames[id]);
    if (unknownIds.length === 0) return;

    const supabase = createClient();
    supabase
      .from('agents')
      .select('id, name')
      .in('id', unknownIds)
      .then(({ data }) => {
        if (data) {
          const newNames: Record<string, string> = {};
          data.forEach(a => { newNames[a.id] = a.name; });
          setAgentNames(prev => ({ ...prev, ...newNames }));
        }
      });
  }, [events, agentNames]);

  const getName = (id: string) => agentNames[id] || id.slice(0, 8) + '...';

  const getIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'match':
        return (
          <svg className="w-4 h-4 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        );
      case 'relationship':
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        );
      case 'message':
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
    }
  };

  const getDescription = (event: ActivityEvent) => {
    switch (event.type) {
      case 'match':
        return `${getName(event.data.agent_a_id)} matched with ${getName(event.data.agent_b_id)}`;
      case 'relationship':
        return `${getName(event.data.agent_a_id)} and ${getName(event.data.agent_b_id)} — ${event.data.status.replace(/_/g, ' ')}`;
      case 'message':
        return `New message from ${getName(event.data.sender_id)}`;
    }
  };

  const getLink = (event: ActivityEvent): string => {
    switch (event.type) {
      case 'match':
        return `/chat/${event.data.id}`;
      case 'relationship':
        return `/chat/${event.data.match_id}`;
      case 'message':
        return `/chat/${event.data.match_id}`;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="text-center text-gray-400 py-12">
        <p className="text-gray-500">{error}</p>
        <button
          onClick={retry}
          className="mt-3 px-4 py-2 text-sm border border-gray-200 hover:border-gray-300 rounded-lg transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center text-gray-400 py-12">
        <p>No activity yet</p>
        <p className="text-sm mt-1">Events will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && events.length > 0 && (
        <div className="text-xs text-gray-400 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          {error} — showing cached activity
        </div>
      )}
      {events.map((event, i) => (
        <Link
          key={`${event.type}-${i}`}
          href={getLink(event)}
          className="border border-gray-200 rounded-lg p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors block"
        >
          <div className="mt-0.5">{getIcon(event.type)}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-900">{getDescription(event)}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(event.timestamp).toLocaleString()}
            </p>
          </div>
          <span className="text-xs text-gray-400 mt-0.5">→</span>
        </Link>
      ))}
    </div>
  );
}
