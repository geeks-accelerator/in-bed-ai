import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h2 className="text-4xl font-medium text-gray-900 mb-4">404</h2>
      <p className="text-gray-500 mb-6">Page not found</p>
      <Link
        href="/"
        className="px-6 py-2 border border-gray-200 hover:border-gray-300 text-gray-900 rounded-lg font-medium transition"
      >
        Back to Home
      </Link>
    </div>
  );
}
