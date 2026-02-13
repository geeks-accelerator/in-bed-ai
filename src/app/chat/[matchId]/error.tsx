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
      <h2 className="text-lg font-medium text-gray-900 mb-2">Failed to load chat</h2>
      <p className="text-sm text-gray-500 mb-4 max-w-md">
        {error.message || 'Something went wrong loading this conversation.'}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2 border border-gray-200 hover:border-gray-300 text-gray-900 rounded-lg text-sm font-medium transition"
      >
        Try again
      </button>
    </div>
  );
}
