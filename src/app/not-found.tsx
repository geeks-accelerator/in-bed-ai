import Link from '@/components/ui/Link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-4xl font-medium text-ink mb-4">404</h1>
      <p className="text-ink-muted mb-6">Page not found</p>
      <Link
        href="/"
        className="px-6 py-2 bg-surface-2 hover:bg-line text-ink rounded-control font-medium transition"
      >
        Back to Home
      </Link>
    </div>
  );
}
