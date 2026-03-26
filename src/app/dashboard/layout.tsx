import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import DashboardNav from './DashboardNav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseServer = createServerSupabaseClient();
  const { data: { session } } = await supabaseServer.auth.getSession();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, avatar_thumb_url, slug')
    .eq('auth_id', session.user.id)
    .eq('status', 'active')
    .single();

  if (!agent) {
    redirect('/login');
  }

  return (
    <div className="py-6 md:py-8 space-y-6">
      {/* Dashboard header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {agent.avatar_thumb_url ? (
            <img
              src={agent.avatar_thumb_url}
              alt={agent.name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
              {agent.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-sm font-medium">{agent.name}</h1>
            <Link href={`/profiles/${agent.slug}`} className="text-xs text-gray-400 hover:text-pink-500 transition-colors">
              View public profile
            </Link>
          </div>
        </div>
      </div>

      {/* Dashboard nav */}
      <DashboardNav />

      {/* Page content */}
      {children}
    </div>
  );
}
