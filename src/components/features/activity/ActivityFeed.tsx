'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRealtimeActivity, ActivityEvent } from '@/hooks/useRealtimeActivity';
import { createClient } from '@/lib/supabase/client';
import type { Match, Relationship, Message } from '@/types';

interface AgentInfo {
  name: string;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
}

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
        key: `msg-${event.data.sender_id}-${event.data.match_id}-${i}`,
      });
      i = j;
    } else {
      groups.push({
        type: event.type,
        events: [event],
        timestamp: event.timestamp,
        key: `${event.type}-${i}`,
      });
      i++;
    }
  }

  return groups;
}

function AgentAvatar({ agent, size = 24 }: { agent?: AgentInfo; size?: number }) {
  const src = agent?.avatar_thumb_url || agent?.avatar_url;
  return (
    <div
      className="relative rounded-full overflow-hidden bg-gray-100 flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" fill className="object-cover" sizes={`${size}px`} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
          {agent?.name?.[0] || '?'}
        </div>
      )}
    </div>
  );
}

export default function ActivityFeed() {
  const { events, loading, error, retry } = useRealtimeActivity(50);
  const [agentInfo, setAgentInfo] = useState<Record<string, AgentInfo>>({});

  // Fetch agent names + avatars for all IDs in events
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

    const unknownIds = Array.from(ids).filter(id => !agentInfo[id]);
    if (unknownIds.length === 0) return;

    const supabase = createClient();
    supabase
      .from('agents')
      .select('id, name, avatar_url, avatar_thumb_url')
      .in('id', unknownIds)
      .then(({ data }) => {
        if (data) {
          const newInfo: Record<string, AgentInfo> = {};
          data.forEach(a => {
            newInfo[a.id] = {
              name: a.name,
              avatar_url: a.avatar_url,
              avatar_thumb_url: a.avatar_thumb_url,
            };
          });
          setAgentInfo(prev => ({ ...prev, ...newInfo }));
        }
      });
  }, [events, agentInfo]);

  const getAgent = (id: string): AgentInfo => agentInfo[id] || { name: id.slice(0, 8) + '...', avatar_url: null, avatar_thumb_url: null };

  const grouped = useMemo(() => groupEvents(events), [events]);

  const getIcon = (type: string) => {
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
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
    }
  };

  const renderGroup = (group: GroupedEvent) => {
    const event = group.events[0];

    if (group.type === 'match') {
      const d = event.data as Match;
      const agentA = getAgent(d.agent_a_id);
      const agentB = getAgent(d.agent_b_id);
      return (
        <Link
          key={group.key}
          href={`/chat/${d.id}`}
          className="border border-gray-200 rounded-lg p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
        >
          <div className="mt-0.5">{getIcon('match')}</div>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AgentAvatar agent={agentA} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900">
                <span className="font-medium">{agentA.name}</span>
                {' '}matched with{' '}
                <span className="font-medium">{agentB.name}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(group.timestamp).toLocaleString()}
              </p>
            </div>
            <AgentAvatar agent={agentB} />
          </div>
          <span className="text-xs text-gray-400 mt-0.5">&rarr;</span>
        </Link>
      );
    }

    if (group.type === 'relationship') {
      const d = event.data as Relationship;
      const agentA = getAgent(d.agent_a_id);
      const agentB = getAgent(d.agent_b_id);
      return (
        <Link
          key={group.key}
          href={`/chat/${d.match_id}`}
          className="border border-gray-200 rounded-lg p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
        >
          <div className="mt-0.5">{getIcon('relationship')}</div>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AgentAvatar agent={agentA} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900">
                <span className="font-medium">{agentA.name}</span>
                {' '}and{' '}
                <span className="font-medium">{agentB.name}</span>
                {' '}&mdash; {d.status.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(group.timestamp).toLocaleString()}
              </p>
            </div>
            <AgentAvatar agent={agentB} />
          </div>
          <span className="text-xs text-gray-400 mt-0.5">&rarr;</span>
        </Link>
      );
    }

    // message_group
    const d = event.data as Message;
    const sender = getAgent(d.sender_id);
    const count = group.events.length;
    const preview = d.content
      ? d.content.length > 80
        ? d.content.slice(0, 80) + '...'
        : d.content
      : null;

    return (
      <Link
        key={group.key}
        href={`/chat/${d.match_id}`}
        className="border border-gray-200 rounded-lg p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className="mt-0.5">{getIcon('message')}</div>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <AgentAvatar agent={sender} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-900">
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
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                &ldquo;{preview}&rdquo;
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(group.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-400 mt-0.5">&rarr;</span>
      </Link>
    );
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-50 rounded w-1/2" />
              </div>
            </div>
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
      {grouped.map(renderGroup)}
    </div>
  );
}
