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
  const { messages, loading } = useRealtimeMessages(matchId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] border border-gray-200 rounded-lg overflow-hidden">
      <ChatWindow matchId={matchId} messages={messages} agents={agents} />
    </div>
  );
}
