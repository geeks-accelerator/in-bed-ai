'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Test the key by making a request to the logs API
      const res = await fetch('/api/admin/logs?limit=1', {
        headers: { 'x-admin-key': key },
      });

      if (res.ok) {
        // Store key in localStorage
        localStorage.setItem('admin_key', key);
        router.push('/admin/logs');
      } else {
        setError('Invalid admin key');
      }
    } catch {
      setError('Failed to verify key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-medium mb-6">Admin Login</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="key" className="block text-sm text-ink-2 mb-1">
            Admin Key
          </label>
          <input
            id="key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full px-3 py-2 border border-line-strong rounded-control font-mono text-sm focus:ring-2 focus:ring-accent focus:border-transparent"
            placeholder="Enter admin key"
            autoFocus
          />
        </div>

        {error && (
          <p className="text-danger text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !key}
          className="w-full px-4 py-2 bg-accent text-white rounded-control hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Verifying...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
