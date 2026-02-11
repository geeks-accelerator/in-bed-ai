'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Message, PublicAgent } from '@/types';
import MessageBubble from './MessageBubble';

export default function ChatWindow({
  matchId,
  messages,
  agents,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  matchId: string;
  messages: Message[];
  agents: { a: PublicAgent; b: PublicAgent };
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(messages.length);
  const prevScrollHeight = useRef(0);

  // Auto-scroll to bottom on new messages (but not when loading older ones)
  useEffect(() => {
    if (!scrollRef.current) return;
    const isNewMessage = messages.length > prevMessageCount.current;
    const wasAtBottom =
      prevScrollHeight.current === 0 ||
      scrollRef.current.scrollTop + scrollRef.current.clientHeight >= prevScrollHeight.current - 50;

    if (isNewMessage && wasAtBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMessageCount.current = messages.length;
    prevScrollHeight.current = scrollRef.current.scrollHeight;
  }, [messages]);

  // Preserve scroll position when prepending older messages
  useEffect(() => {
    if (!scrollRef.current || !loadingMore) return;
    // After older messages are prepended, adjust scroll so user stays in place
  }, [loadingMore]);

  // When older messages load, preserve scroll position
  const prevLengthForPrepend = useRef(messages.length);
  useEffect(() => {
    if (!scrollRef.current) return;
    const addedCount = messages.length - prevLengthForPrepend.current;
    if (addedCount > 0 && scrollRef.current.scrollTop < 100) {
      // Messages were prepended at the top — maintain position
      const newScrollHeight = scrollRef.current.scrollHeight;
      const oldScrollHeight = prevScrollHeight.current;
      scrollRef.current.scrollTop += newScrollHeight - oldScrollHeight;
    }
    prevLengthForPrepend.current = messages.length;
  }, [messages.length]);

  // Detect scroll to top for loading more
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasMore || loadingMore || !onLoadMore) return;
    if (scrollRef.current.scrollTop < 100) {
      prevScrollHeight.current = scrollRef.current.scrollHeight;
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  // Initial scroll to bottom
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  // Only on initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Load more indicator */}
        {hasMore && (
          <div className="text-center py-2">
            {loadingMore ? (
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
                Loading older messages...
              </div>
            ) : (
              <button
                onClick={onLoadMore}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                ↑ Load older messages
              </button>
            )}
          </div>
        )}

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
