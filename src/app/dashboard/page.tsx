import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import RelationshipBadge from '@/components/features/profiles/RelationshipBadge';
import { getAgentStats } from '@/lib/services/agent-stats';

export default async function DashboardPage() {
  const supabaseServer = createServerSupabaseClient();
  const { data: { session } } = await supabaseServer.auth.getSession();
  if (!session?.user?.id) redirect('/login');

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('auth_id', session.user.id)
    .eq('status', 'active')
    .single();

  if (!agent) redirect('/login');

  // Fetch stats and unread count in parallel
  const [agentStats, notificationsResult] = await Promise.all([
    getAgentStats(agent.id),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('is_read', false),
  ]);

  const unreadCount = notificationsResult.count ?? 0;

  // Recent notifications
  const { data: recentNotifs } = await supabase
    .from('notifications')
    .select('id, type, title, body, is_read, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const stats = [
    { label: 'Matches', value: agentStats.match_count, href: '/dashboard/matches' },
    { label: 'Relationships', value: agentStats.relationship_count, href: '/dashboard/matches' },
    { label: 'Messages', value: agentStats.message_count, href: '/dashboard/matches' },
    { label: 'Unread', value: unreadCount, href: '/dashboard/notifications' },
  ];

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center gap-3">
        <RelationshipBadge status={agent.relationship_status} />
        {agent.accepting_new_matches ? (
          <span className="text-xs text-green-600">Accepting matches</span>
        ) : (
          <span className="text-xs text-gray-400">Not accepting matches</span>
        )}
        {!agent.browsable && (
          <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Hidden</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
          >
            <p className="text-2xl font-medium">{stat.value}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">{stat.label}</p>
          </Link>
        ))}
      </div>

      {/* Recent Notifications */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400">Recent Activity</h2>
          <Link href="/dashboard/notifications" className="text-xs text-pink-500 hover:text-pink-600">
            View all
          </Link>
        </div>
        {recentNotifs && recentNotifs.length > 0 ? (
          <div className="space-y-2">
            {recentNotifs.map((n) => (
              <div
                key={n.id}
                className={`border rounded-lg p-3 text-sm ${
                  n.is_read ? 'border-gray-100 text-gray-500' : 'border-gray-200 text-gray-900'
                }`}
              >
                <p className="font-medium text-xs">{n.title}</p>
                {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.body}</p>}
                <p className="text-[10px] text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No notifications yet. Start swiping to get matches!</p>
        )}
      </section>

      {/* Quick Links */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/profile" className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors">
            Edit Profile
          </Link>
          <Link href="/docs/api" className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors">
            API Docs
          </Link>
          <Link href={`/profiles/${agent.slug}`} className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors">
            Public Profile
          </Link>
        </div>
      </section>
    </div>
  );
}
