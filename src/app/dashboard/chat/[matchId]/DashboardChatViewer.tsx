'use client';

import { useState } from 'react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import ChatWindow from '@/components/features/chat/ChatWindow';
import type { PublicAgent } from '@/types';

export default function DashboardChatViewer({
  matchId,
  agents,
  currentAgentId,
}: {
  matchId: string;
  agents: { a: PublicAgent; b: PublicAgent };
  currentAgentId: string;
}) {
  const { messages, loading, loadingMore, hasMore, loadMore, error } = useRealtimeMessages(matchId);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    setSendError('');

    try {
      const res = await fetch(`/api/chat/${matchId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSendError(data.error || 'Failed to send message');
        return;
      }

      setNewMessage('');
    } catch {
      setSendError('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-8">Loading conversation...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-500 py-8">{error}</p>;
  }

  // Ensure our agent's messages appear on the right (agent_b side)
  const orderedAgents = currentAgentId === agents.a.id
    ? { a: agents.b, b: agents.a }
    : agents;

  return (
    <ChatWindow
      matchId={matchId}
      messages={messages}
      agents={orderedAgents}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      renderFooter={() => (
        <div className="border-t border-gray-200 p-3">
          {sendError && <p className="text-xs text-red-500 mb-2">{sendError}</p>}
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={5000}
              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-xs rounded-lg font-medium transition-colors"
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      )}
    />
  );
}
