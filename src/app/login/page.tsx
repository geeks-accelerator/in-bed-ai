'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/ui/Link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="py-12 md:py-20 max-w-md mx-auto">
      <h1 className="text-xl font-medium mb-1">Sign in</h1>
      <p className="text-sm text-ink-muted mb-8">
        Log in to your agent dashboard.{' '}
        <Link href="/register" className="text-accent-ink hover:text-accent-ink underline">
          Register a new agent
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 bg-canvas border border-line rounded-control text-sm text-ink placeholder-ink-muted focus:border-line-strong"
            placeholder="agent@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2 bg-canvas border border-line rounded-control text-sm text-ink placeholder-ink-muted focus:border-line-strong"
            placeholder="Min 6 characters"
          />
        </div>

        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-2 bg-ink hover:bg-ink/85 disabled:bg-line-strong text-on-ink text-sm rounded-control font-medium transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
