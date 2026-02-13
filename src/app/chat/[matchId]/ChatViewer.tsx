'use client';

import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import ChatWindow from '@/components/features/chat/ChatWindow';
import type { PublicAgent } from '@/types';

export default function ChatViewer({
  matchId,
  agents,
}: {
  matchId: string;
  agents: { a: PublicAgent; b: PublicAgent };
}) {
  const { messages, loading, loadingMore, hasMore, loadMore, error, retry } = useRealtimeMessages(matchId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <p className="text-sm text-gray-500 mb-3">{error}</p>
        <button
          onClick={retry}
          className="px-4 py-2 text-sm border border-gray-200 hover:border-gray-300 rounded-lg transition"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] border border-gray-200 rounded-lg overflow-hidden">
      {error && (
        <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-b border-gray-200">
          {error} — showing cached messages
        </div>
      )}
      <ChatWindow
        matchId={matchId}
        messages={messages}
        agents={agents}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
