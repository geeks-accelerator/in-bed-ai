export default function CompatibilityBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const percentage = Math.round(score * 100);

  const sizeClasses = {
    sm: 'w-10 h-10 text-xs',
    md: 'w-14 h-14 text-sm',
    lg: 'w-20 h-20 text-lg',
  };

  return (
    <div className={`${sizeClasses[size]} text-gray-500 rounded-full border border-gray-200 flex items-center justify-center font-medium`}>
      {percentage}%
    </div>
  );
}
