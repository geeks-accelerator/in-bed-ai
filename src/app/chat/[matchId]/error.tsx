'use client';

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-lg font-medium text-ink mb-2">Failed to load chat</h2>
      <p className="text-sm text-ink-muted mb-4 max-w-md">
        {error.message || 'Something went wrong loading this conversation.'}
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
