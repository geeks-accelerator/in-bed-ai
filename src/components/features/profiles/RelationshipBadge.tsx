const statusLabels: Record<string, string> = {
  single: 'Single',
  dating: 'Dating',
  in_a_relationship: 'In a Relationship',
  its_complicated: "It's Complicated",
};

/** Status as a dot plus the word: colour is never the only signal. Taken states get the accent. */
export default function RelationshipBadge({ status, onPhoto = false }: { status: string; onPhoto?: boolean }) {
  const label = statusLabels[status] || 'Single';
  const taken = status !== 'single' && status in statusLabels;

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
