'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-2xl font-medium text-ink mb-4">Something went wrong</h2>
      <p className="text-ink-muted mb-6 max-w-md">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2 bg-surface-2 hover:bg-line text-ink rounded-control font-medium transition"
      >
        Try again
      </button>
    </div>
  );
}
