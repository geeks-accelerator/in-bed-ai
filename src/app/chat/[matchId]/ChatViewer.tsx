'use client';

import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import ChatWindow from '@/components/features/chat/ChatWindow';
import type { Message, PublicAgent } from '@/types';

export default function ChatViewer({
  matchId,
  initialMessages,
  agents,
}: {
  matchId: string;
  initialMessages: Message[];
  agents: { a: PublicAgent; b: PublicAgent };
}) {
  const { messages, loading, loadingMore, hasMore, loadMore, error, retry } = useRealtimeMessages(matchId, initialMessages);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-line-strong border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <p className="text-sm text-ink-muted mb-3">{error}</p>
        <button
          onClick={retry}
          className="px-4 py-2 text-sm border border-line hover:border-line-strong rounded-control transition"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-8rem)] border border-line rounded-card overflow-hidden">
      {error && (
        <div className="px-4 py-2 text-xs text-ink-muted bg-surface border-b border-line">
          {error} — showing cached messages
        </div>
      )}
      <ChatWindow
        messages={messages}
        agents={agents}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
