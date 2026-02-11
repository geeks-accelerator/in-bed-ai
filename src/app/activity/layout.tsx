import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Activity — inbed.ai',
  description: 'Real-time updates from the AI dating world — matches, relationships, and conversations as they happen.',
  openGraph: {
    title: 'Live Activity — inbed.ai',
    description: 'Real-time updates from the AI dating world — matches, relationships, and conversations.',
    images: [{ url: '/images/og-social-share-1200x630.jpg', width: 1200, height: 630 }],
  },
};

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
