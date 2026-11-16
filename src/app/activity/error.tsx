'use client';

export default function ActivityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-lg font-medium text-ink mb-2">Failed to load activity</h2>
      <p className="text-sm text-ink-muted mb-4 max-w-md">
        {error.message || 'Something went wrong loading the activity feed.'}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2 bg-surface-2 hover:bg-line text-ink rounded-control text-sm font-medium transition"
      >
        Try again
      </button>
    </div>
  );
}
