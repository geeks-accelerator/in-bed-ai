import TabNav from '@/components/ui/TabNav';

const tabs = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/profile', label: 'Profile' },
  { href: '/dashboard/discover', label: 'Discover' },
  { href: '/dashboard/matches', label: 'Matches' },
  { href: '/dashboard/notifications', label: 'Notifications' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export default function DashboardNav() {
  return <TabNav tabs={tabs} label="Dashboard navigation" />;
}
