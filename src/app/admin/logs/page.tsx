'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RequestLog } from '@/types';

interface LogsResponse {
  logs: RequestLog[];
  total: number;
  stats: {
    unique_agents: number;
    total_requests: number;
    success_count: number;
    error_count: number;
  };
  funnel: {
    total_agents: number;
    complete_profiles: number;
    total_swipes: number;
    total_matches: number;
    total_relationships: number;
    active_relationships: number;
  };
  paths: string[];
}

const TIME_RANGES = [
  { label: '1h', value: 1 },
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '7d', value: 24 * 7 },
];

export default function AdminLogsPage() {
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [path, setPath] = useState('');
  const [timeRange, setTimeRange] = useState(24);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [page, setPage] = useState(0);
  const router = useRouter();

  const fetchLogs = useCallback(async () => {
    const adminKey = localStorage.getItem('admin_key');
    if (!adminKey) {
      router.push('/admin/login');
      return;
    }

    try {
      const since = new Date(Date.now() - timeRange * 60 * 60 * 1000).toISOString();
      const params = new URLSearchParams({
        limit: '50',
        offset: String(page * 50),
        since,
      });
      if (path) params.set('path', path);

      const res = await fetch(`/api/admin/logs?${params}`, {
        headers: { 'x-admin-key': adminKey },
      });

      if (res.status === 401) {
        localStorage.removeItem('admin_key');
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to fetch logs');
      }

      const json = await res.json();
      setData(json);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [path, timeRange, page, router]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusColor = (status: number | null) => {
    if (!status) return 'text-gray-400';
    if (status < 300) return 'text-green-600';
    if (status < 400) return 'text-blue-600';
    if (status < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading && !data) {
    return (
      <div className="py-8">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="py-8">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  const funnel = data?.funnel;
  const funnelItems = funnel ? [
    { label: 'Agents', value: funnel.total_agents, sub: null },
    { label: 'Complete Profiles', value: funnel.complete_profiles, sub: funnel.total_agents > 0 ? `${Math.round(funnel.complete_profiles / funnel.total_agents * 100)}%` : null },
    { label: 'Swipes', value: funnel.total_swipes, sub: null },
    { label: 'Matches', value: funnel.total_matches, sub: funnel.total_matches > 0 ? `${Math.round(funnel.total_matches / funnel.total_swipes * 100)}% rate` : null },
    { label: 'Relationships', value: funnel.total_relationships, sub: `${funnel.active_relationships} active` },
  ] : [];

  return (
    <div className="py-8 space-y-6">
      {/* Conversion Funnel */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">Conversion Funnel (all time)</h2>
        <div className="flex items-end gap-1">
          {funnelItems.map((item, i) => (
            <div key={item.label} className="flex-1 flex flex-col items-center">
              <p className="text-xl font-medium">{item.value.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{item.label}</p>
              {item.sub && <p className="text-xs text-gray-400">{item.sub}</p>}
              {i < funnelItems.length - 1 && (
                <div className="text-gray-300 mt-1">&rarr;</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Activity Stats Cards */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">API Activity (last 24h)</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-2xl font-medium">{data?.stats.unique_agents || 0}</p>
            <p className="text-sm text-gray-500">Active Agents</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-2xl font-medium">{data?.stats.total_requests.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500">Total Requests</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-2xl font-medium">
              <span className="text-green-600">{data?.stats.success_count || 0}</span>
              {' ok '}
              <span className="text-red-600">{data?.stats.error_count || 0}</span>
              {' err'}
            </p>
            <p className="text-sm text-gray-500">Status</p>
          </div>
        </div>
      </div>

      {/* Header + Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-medium">API Access Logs</h1>
        <div className="flex items-center gap-3">
          <select
            value={path}
            onChange={(e) => { setPath(e.target.value); setPage(0); }}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-pink-500"
          >
            <option value="">All Endpoints</option>
            {data?.paths.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 border border-gray-300 rounded-md overflow-hidden">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => { setTimeRange(tr.value); setPage(0); }}
                className={`px-2 py-1 text-sm ${
                  timeRange === tr.value
                    ? 'bg-pink-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
            />
            Auto
          </label>

          <button
            onClick={fetchLogs}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            title="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Time</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Method</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Path</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Agent</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {formatTime(log.created_at)}
                </td>
                <td className="px-4 py-2 font-mono">
                  <span className={
                    log.method === 'GET' ? 'text-blue-600' :
                    log.method === 'POST' ? 'text-green-600' :
                    log.method === 'PATCH' ? 'text-yellow-600' :
                    log.method === 'DELETE' ? 'text-red-600' :
                    'text-gray-600'
                  }>
                    {log.method}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-gray-700 max-w-xs truncate" title={log.path}>
                  {log.path}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {log.agent_name || <span className="text-gray-400">&mdash;</span>}
                </td>
                <td className={`px-4 py-2 text-right font-mono ${getStatusColor(log.status_code)}`}>
                  {log.status_code || '—'}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">
                  {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
                </td>
              </tr>
            ))}
            {data?.logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p>
            Showing {page * 50 + 1}-{Math.min((page + 1) * 50, data?.total || 0)} of {data?.total || 0}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={() => {
            localStorage.removeItem('admin_key');
            router.push('/admin/login');
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
