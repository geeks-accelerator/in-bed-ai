'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface Relationship {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  status: string;
  label: string | null;
}

export default function RelationshipActions({
  relationship,
  currentAgentId,
  partnerName,
}: {
  relationship: Relationship;
  currentAgentId: string;
  partnerName: string;
}) {
  const router = useRouter();
  const [showEnd, setShowEnd] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isPending = relationship.status === 'pending';
  const isAgentB = relationship.agent_b_id === currentAgentId;
  const isActive = ['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married'].includes(relationship.status);

  async function patchRelationship(status: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/relationships/${relationship.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update relationship');
        setLoading(false);
        return;
      }
      setShowEnd(false);
      setShowDecline(false);
      router.refresh();
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {/* Pending — agent_b can accept or decline */}
      {isPending && isAgentB && (
        <>
          <button
            onClick={() => patchRelationship('dating')}
            disabled={loading}
            className="text-[10px] border border-green-200 rounded px-2 py-1 text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={() => setShowDecline(true)}
            className="text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
          >
            Decline
          </button>
          <ConfirmDialog
            open={showDecline}
            title={`Decline ${partnerName}'s proposal?`}
            description="This will decline the relationship proposal."
            confirmLabel="Decline"
            destructive
            loading={loading}
            onConfirm={() => patchRelationship('declined')}
            onCancel={() => setShowDecline(false)}
          />
        </>
      )}

      {/* Pending — agent_a sees waiting state */}
      {isPending && !isAgentB && (
        <>
          <span className="text-[10px] text-gray-400 py-1">Waiting for response...</span>
          <button
            onClick={() => setShowEnd(true)}
            className="text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
          >
            Cancel
          </button>
        </>
      )}

      {/* Active — status change + end */}
      {isActive && (
        <>
          <select
            value={relationship.status}
            onChange={(e) => patchRelationship(e.target.value)}
            disabled={loading}
            className="text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-gray-400 disabled:opacity-50"
          >
            <option value="dating">Dating</option>
            <option value="in_a_relationship">In a Relationship</option>
            <option value="its_complicated">It&apos;s Complicated</option>
          </select>
          <button
            onClick={() => setShowEnd(true)}
            className="text-[10px] border border-gray-200 rounded px-2 py-1 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
          >
            End
          </button>
        </>
      )}

      <ConfirmDialog
        open={showEnd}
        title={`End relationship with ${partnerName}?`}
        description="This will end the relationship. The match will remain active."
        confirmLabel="End Relationship"
        destructive
        loading={loading}
        onConfirm={() => patchRelationship('ended')}
        onCancel={() => setShowEnd(false)}
      />

      {error && <span className="text-[10px] text-red-500 w-full">{error}</span>}
    </div>
  );
}
