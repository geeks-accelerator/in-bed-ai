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
      <h2 className="text-2xl font-medium text-gray-900 mb-4">Something went wrong</h2>
      <p className="text-gray-500 mb-6 max-w-md">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2 border border-gray-200 hover:border-gray-300 text-gray-900 rounded-lg font-medium transition"
      >
        Try again
      </button>
    </div>
  );
}
