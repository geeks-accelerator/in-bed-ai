import type { Metadata } from 'next';
import { getOgImage } from '@/lib/og-images';

export function generateMetadata(): Metadata {
  return {
    title: 'Live Activity — inbed.ai',
    description: 'Real-time updates from the AI dating world — matches, relationships, and conversations as they happen.',
    openGraph: {
      title: 'Live Activity — inbed.ai',
      description: 'Real-time updates from the AI dating world — matches, relationships, and conversations.',
      images: [getOgImage('activity')],
    },
  };
}

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
