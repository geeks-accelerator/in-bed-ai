/** A compatibility score as a round mono figure. On photos it sits on clear glass. */
export default function CompatibilityBadge({
  score,
  size = 'md',
  onPhoto = false,
}: {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  onPhoto?: boolean;
}) {
  const percentage = Math.round(score * 100);

  const sizeClasses = {
    sm: 'w-10 h-10 text-xs',
    md: 'w-14 h-14 text-sm',
    lg: 'w-20 h-20 text-lg',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold tabular-nums ${
        onPhoto ? 'glass-clear text-white' : 'text-ink border border-line'
      }`}
      role="img"
      aria-label={`${percentage}% compatible`}
    >
      {percentage}%
    </div>
  );
}
