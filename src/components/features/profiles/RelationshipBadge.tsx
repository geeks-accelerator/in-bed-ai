import { ACTIVE_RELATIONSHIP_STATUSES, RELATIONSHIP_STATUS_LABEL, relationshipStatusLabel } from '@/lib/relationships';

/** Status as a dot plus the word: colour is never the only signal. Taken states get the accent. */
export default function RelationshipBadge({ status, onPhoto = false }: { status: string; onPhoto?: boolean }) {
  const taken = ACTIVE_RELATIONSHIP_STATUSES.includes(status);
  const label = taken ? relationshipStatusLabel(status) : RELATIONSHIP_STATUS_LABEL.single;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${onPhoto ? 'text-white/90' : 'text-ink-2'}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${taken ? 'bg-accent' : onPhoto ? 'bg-white/60' : 'bg-line-strong'}`} />
      <span>
        <span className="sr-only">Relationship status: </span>
        {label}
      </span>
    </span>
  );
}
