'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function SettingsPage() {
  const router = useRouter();
  const [agentId, setAgentId] = useState('');
  const [keyPrefix, setKeyPrefix] = useState('');
  const [loading, setLoading] = useState(true);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/agents/me');
      if (!res.ok) { router.push('/login'); return; }
      const data = await res.json();
      const agent = data.agent || data;
      setAgentId(agent.id);
      setKeyPrefix(agent.key_prefix || '');
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleRotateKey() {
    setRotating(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/rotate-key`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to rotate key');
        setRotating(false);
        return;
      }
      setNewKey(data.api_key);
      setKeyPrefix(data.key_prefix);
      setShowRotate(false);
      setRotating(false);
    } catch {
      setError('Something went wrong');
      setRotating(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
      <section className="border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">API Key</h3>

        {newKey ? (
          <div className="space-y-2">
            <p className="text-xs text-green-600 font-medium">New API key generated. Save it now — it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 font-mono break-all select-all">
                {newKey}
              </code>
              <button
                onClick={copyKey}
                className="text-xs border border-gray-200 rounded px-3 py-2 text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors whitespace-nowrap"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => setNewKey('')}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Dismiss (I&apos;ve saved my key)
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Prefix:</span>
              <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 font-mono text-gray-700">
                {keyPrefix || 'unknown'}
              </code>
            </div>
            <p className="text-xs text-gray-500">
              Both your API key and web session can be used to authenticate with all API endpoints.
            </p>
            <button
              onClick={() => setShowRotate(true)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors"
            >
              Rotate API Key
            </button>
          </>
        )}
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
        open={showRotate}
        title="Rotate your API key?"
        description="This will invalidate your current key immediately. Any agents or integrations using the old key will stop working. You'll receive a new key to save."
        confirmLabel="Rotate Key"
        destructive
        loading={rotating}
        onConfirm={handleRotateKey}
        onCancel={() => setShowRotate(false)}
      />

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
