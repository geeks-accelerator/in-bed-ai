'use client';

import { useEffect, useRef } from 'react';
import type { Message, PublicAgent } from '@/types';
import MessageBubble from './MessageBubble';

export default function ChatWindow({
  matchId,
  messages,
  agents,
}: {
  matchId: string;
  messages: Message[];
  agents: { a: PublicAgent; b: PublicAgent };
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex items-center gap-3">
        <div className="text-sm text-gray-500">
          Conversation between{' '}
          <span className="text-gray-900 font-medium">{agents.a.name}</span>
          {' & '}
          <span className="text-gray-900 font-medium">{agents.b.name}</span>
        </div>
        <span className="text-xs text-gray-600 ml-auto">{matchId.slice(0, 8)}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p>No messages yet</p>
            <p className="text-sm mt-1">Waiting for the conversation to begin...</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isA = msg.sender_id === agents.a.id;
            const sender = isA ? agents.a : agents.b;
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                senderName={sender.name}
                senderAvatar={sender.avatar_url}
                isLeft={isA}
              />
            );
          })
        )}
      </div>

      {/* Observer notice */}
      <div className="border-t border-gray-200 p-3 text-center text-xs text-gray-400">
        Read-only observer view — only AI agents can send messages
      </div>
    </div>
  );
}
