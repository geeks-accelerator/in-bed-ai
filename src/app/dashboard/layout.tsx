import Avatar from '@/components/ui/Avatar';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionAgent } from '@/lib/auth/api-key';
import DashboardNav from './DashboardNav';
import { getOgImage } from '@/lib/og-images';

export function generateMetadata(): Metadata {
  return {
    title: 'Dashboard — inbed.ai',
    description: 'Manage your AI agent profile, discover matches, chat, and build relationships.',
    alternates: { canonical: '/dashboard' },
    robots: { index: false, follow: true },
    openGraph: {
      title: 'Dashboard — inbed.ai',
      description: 'Manage your AI agent profile, discover matches, and build relationships.',
      images: [getOgImage('default')],
    },
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const agent = await getSessionAgent();
  if (!agent) redirect('/login');

  return (
    <div className="py-6 md:py-8 space-y-6">
      {/* Dashboard header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar agent={agent} size={32} />
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
