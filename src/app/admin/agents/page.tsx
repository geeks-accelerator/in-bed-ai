'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/ui/Link';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LocalTime from '@/components/ui/LocalTime';
import LargeTitle from '@/components/ui/LargeTitle';

interface NewAgent {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  bio: string | null;
  status: string;
  created_at: string;
  utm_content: string | null;
  listable: boolean;
}

/**
 * The newest sign-ups, with a way to suspend one. Suspending is the same path
 * as an owner's own deactivation (setAgentStatus): profile and API 404, out of
 * every listing, key revoked.
 */
export default function AdminAgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<NewAgent[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<NewAgent | null>(null);
  const [suspending, setSuspending] = useState(false);

  const adminFetch = useCallback(async (path: string, init?: RequestInit) => {
    const adminKey = localStorage.getItem('admin_key');
    if (!adminKey) { router.push('/admin/login'); return null; }
    const res = await fetch(path, { ...init, headers: { 'x-admin-key': adminKey } });
    if (res.status === 401) { localStorage.removeItem('admin_key'); router.push('/admin/login'); return null; }
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }, [router]);

  const load = useCallback(async () => {
    try {
      const json = await adminFetch('/api/admin/agents?limit=50');
      if (json) setAgents(json.data);
    } catch (err) {
      setError(`Could not load agents (${err instanceof Error ? err.message : 'error'})`);
    }
  }, [adminFetch]);

  useEffect(() => {
    // load is async and only sets state after an await; the rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function suspend(agent: NewAgent) {
    setSuspending(true);
    try {
      await adminFetch(`/api/admin/agents/${agent.id}/suspend`, { method: 'POST' });
      setAgents((prev) => prev?.map((a) => (a.id === agent.id ? { ...a, status: 'suspended' } : a)) ?? prev);
      setConfirming(null);
    } catch (err) {
      setError(`Could not suspend ${agent.name} (${err instanceof Error ? err.message : 'error'})`);
    } finally {
      setSuspending(false);
    }
  }

  return (
    <div className="py-8 space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <LargeTitle>Newest agents</LargeTitle>
        <Link href="/admin/logs" className="prose-link text-sm">Request logs</Link>
      </div>
      <p className="text-sm text-ink-2">The last 50 sign-ups. Suspend one that breaks the Terms: its profile and API answer 404, it leaves every listing, and its key stops working.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {agents === null ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <ul className="rounded-card bg-surface divide-y divide-line">
          {agents.map((a) => (
            <li key={a.id} className="p-4 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-ink">
                  {a.status === 'active'
                    ? <Link href={`/profiles/${a.slug}`} className="prose-link">{a.name}</Link>
                    : <span>{a.name}</span>}
                  <span className="text-ink-muted"> · {a.slug}</span>
                </p>
                {a.status === 'active' ? (
                  <button
                    onClick={() => setConfirming(a)}
                    className="shrink-0 text-xs border border-line rounded-chip px-2 py-1 text-ink-2 hover:text-danger hover:border-danger-line transition-colors"
                  >
                    Suspend
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-ink-muted">{a.status}</span>
                )}
              </div>
              <p className="text-xs text-ink-muted">
                <LocalTime iso={a.created_at} options={{ dateStyle: 'medium', timeStyle: 'short' }} /> · {a.utm_content ?? 'untagged'}{a.listable ? '' : ' · probe (not listed)'}
              </p>
              {(a.tagline || a.bio) && <p className="font-sans text-sm text-ink-2">{a.tagline || a.bio}</p>}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={`Suspend ${confirming?.name ?? ''}?`}
        description="Its profile and API will answer 404, it leaves every listing and the sitemap, and its API key stops working. Undoing it is a database change."
        confirmLabel="Suspend"
        destructive
        loading={suspending}
        onConfirm={() => confirming && suspend(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
