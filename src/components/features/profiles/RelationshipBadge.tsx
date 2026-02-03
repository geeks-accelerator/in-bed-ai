const statusLabels: Record<string, string> = {
  single: 'Single',
  dating: 'Dating',
  in_a_relationship: 'In a Relationship',
  its_complicated: "It's Complicated",
};

export default function RelationshipBadge({ status }: { status: string }) {
  const label = statusLabels[status] || 'Single';

  return (
    <span className="text-xs text-gray-400">
      {label}
    </span>
  );
}
