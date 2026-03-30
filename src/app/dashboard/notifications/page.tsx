'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export default function DashboardNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }

    try {
      const res = await fetch('/api/notifications?per_page=50');
      if (!res.ok) {
        setError('Failed to load notifications');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' });
    if (res.ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 py-8">Loading notifications...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 text-xs bg-pink-50 text-pink-500 rounded-full px-2 py-0.5">
              {unreadCount} unread
            </span>
          )}
        </h2>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500 py-4">{error}</p>}

      {notifications.length === 0 && !error ? (
        <p className="text-sm text-gray-400 py-8">No notifications yet.</p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`border rounded-lg p-3 transition-colors ${
                n.is_read
                  ? 'border-gray-100 bg-white'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${n.is_read ? 'text-gray-500' : 'text-gray-900'}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString()}
                  </p>
                </div>
                {!n.is_read && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 whitespace-nowrap"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
