'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function MatchActions({
  matchId,
  partnerName,
  hasActiveRelationship,
}: {
  matchId: string;
  partnerName: string;
  hasActiveRelationship: boolean;
}) {
  const router = useRouter();
  const [showPropose, setShowPropose] = useState(false);
  const [showUnmatch, setShowUnmatch] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [unmatching, setUnmatching] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('dating');
  const [label, setLabel] = useState('');

  async function handlePropose() {
    setProposing(true);
    setError('');
    try {
      const res = await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, status, label: label || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to propose relationship');
        setProposing(false);
        return;
      }
      setShowPropose(false);
      router.refresh();
    } catch {
      setError('Something went wrong');
      setProposing(false);
    }
  }

  async function handleUnmatch() {
    setUnmatching(true);
    setError('');
    try {
      const res = await fetch(`/api/matches/${matchId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to unmatch');
        setUnmatching(false);
        setShowUnmatch(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Something went wrong');
      setUnmatching(false);
      setShowUnmatch(false);
    }
  }

  return (
    <div className="flex gap-1.5 mt-2">
      {!hasActiveRelationship && (
        <>
          <button
            onClick={() => setShowPropose(true)}
            className="text-xs border border-line rounded-chip px-2 py-1 text-ink-muted hover:text-accent-ink hover:border-accent-line transition-colors"
          >
            Propose Relationship
          </button>

          {showPropose && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/30" onClick={() => setShowPropose(false)} />
              <div className="relative bg-canvas border border-line rounded-card p-6 max-w-sm w-full mx-4 shadow-lg space-y-3">
                <h3 className="text-sm font-medium">Propose to {partnerName}</h3>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Desired Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-control text-sm text-ink focus:border-line-strong"
                  >
                    <option value="dating">Dating</option>
                    <option value="in_a_relationship">In a Relationship</option>
                    <option value="its_complicated">It&apos;s Complicated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={200}
                    placeholder="Partners in crime"
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-control text-sm text-ink focus:border-line-strong"
                  />
                </div>
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowPropose(false)} className="px-3 py-1.5 text-xs border border-line rounded-control text-ink-2 hover:border-line-strong transition-colors">
                    Cancel
                  </button>
                  <button onClick={handlePropose} disabled={proposing} className="px-3 py-1.5 text-xs bg-accent hover:bg-accent/90 text-white rounded-control font-medium transition-colors disabled:opacity-50">
                    {proposing ? 'Sending...' : 'Propose'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <button
        onClick={() => setShowUnmatch(true)}
        className="text-xs border border-line rounded-chip px-2 py-1 text-ink-muted hover:text-danger hover:border-danger-line transition-colors"
      >
        Unmatch
      </button>

      <ConfirmDialog
        open={showUnmatch}
        title={`Unmatch ${partnerName}?`}
        description="This will end any active relationships and remove the match. This cannot be undone."
        confirmLabel="Unmatch"
        destructive
        loading={unmatching}
        onConfirm={handleUnmatch}
        onCancel={() => setShowUnmatch(false)}
      />

      {error && !showPropose && !showUnmatch && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
