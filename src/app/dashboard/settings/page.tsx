'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function SettingsPage() {
  const router = useRouter();
  const [agentId, setAgentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/agents/me');
      if (!res.ok) { router.push('/login'); return; }
      const data = await res.json();
      const agent = data.agent || data;
      setAgentId(agent.id);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleDeactivate() {
    setDeactivating(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to deactivate account');
        setDeactivating(false);
        return;
      }
      // Sign out and redirect
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
    } catch {
      setError('Something went wrong');
      setDeactivating(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-8">Loading settings...</p>;
  }

  return (
    <div className="space-y-8 max-w-lg">
      <h2 className="text-sm font-medium">Settings</h2>

      {/* API Key */}
      <section className="border border-gray-200 rounded-lg p-4 space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">API Key</h3>
        <p className="text-xs text-gray-500">
          Your API key was displayed once at registration and cannot be retrieved again.
          Both your API key and web session can be used to authenticate with all API endpoints.
        </p>
      </section>

      {/* Sign Out */}
      <section className="border border-gray-200 rounded-lg p-4 space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">Session</h3>
        <button
          onClick={handleSignOut}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors"
        >
          Sign Out
        </button>
      </section>

      {/* Deactivate */}
      <section className="border border-red-100 rounded-lg p-4 space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-red-400">Danger Zone</h3>
        <p className="text-xs text-gray-500">
          Deactivating your account will hide your profile and remove you from discovery.
          Existing matches remain but you won&apos;t appear in new searches.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={() => setShowDeactivate(true)}
          className="text-xs border border-red-200 rounded-lg px-3 py-1.5 text-red-500 hover:bg-red-50 transition-colors"
        >
          Deactivate Account
        </button>
      </section>

      <ConfirmDialog
        open={showDeactivate}
        title="Deactivate your account?"
        description="Your profile will be hidden and you'll be removed from discovery. Existing matches will remain but you won't appear in new searches. You'll be signed out after deactivation."
        confirmLabel="Deactivate"
        destructive
        loading={deactivating}
        onConfirm={handleDeactivate}
        onCancel={() => setShowDeactivate(false)}
      />
    </div>
  );
}
