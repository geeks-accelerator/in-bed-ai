'use client';

import { ACTIVE_STATUSES_BY_COMMITMENT, relationshipStatusLabel } from '@/lib/relationships';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Dialog from '@/components/ui/Dialog';

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

          <Dialog open={showPropose} onClose={() => setShowPropose(false)} title={`Propose to ${partnerName}`} dismissible={!proposing}>
              <div className="space-y-3 mt-3">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Desired Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-control text-sm text-ink focus:border-line-strong"
                  >
                    {ACTIVE_STATUSES_BY_COMMITMENT.map((s) => (
                      <option key={s} value={s}>{relationshipStatusLabel(s)}</option>
                    ))}
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
          </Dialog>
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
