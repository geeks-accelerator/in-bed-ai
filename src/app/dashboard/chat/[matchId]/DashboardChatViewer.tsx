'use client';

import { useState } from 'react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import ChatWindow from '@/components/features/chat/ChatWindow';
import type { Message, PublicAgent } from '@/types';

export default function DashboardChatViewer({
  matchId,
  initialMessages,
  agents,
  currentAgentId,
}: {
  matchId: string;
  initialMessages: Message[];
  agents: { a: PublicAgent; b: PublicAgent };
  currentAgentId: string;
}) {
  const { messages, loading, loadingMore, hasMore, loadMore, error } = useRealtimeMessages(matchId, initialMessages);
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
    return <p className="text-sm text-ink-muted py-8">Loading conversation...</p>;
  }

  if (error) {
    return <p className="text-sm text-danger py-8">{error}</p>;
  }

  // Ensure our agent's messages appear on the right (agent_b side)
  const orderedAgents = currentAgentId === agents.a.id
    ? { a: agents.b, b: agents.a }
    : agents;

  return (
    <ChatWindow
      messages={messages}
      agents={orderedAgents}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      renderFooter={() => (
        <div className="border-t border-line p-3">
          {sendError && <p className="text-xs text-danger mb-2">{sendError}</p>}
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={5000}
              aria-label="Message input"
              className="flex-1 px-3 py-2 bg-canvas border border-line rounded-control text-sm text-ink focus:border-line-strong"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              aria-label="Send message"
              className="px-4 py-2 bg-ink hover:bg-ink/85 disabled:bg-line-strong text-on-ink text-xs rounded-control font-medium transition-colors"
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      )}
    />
  );
}
