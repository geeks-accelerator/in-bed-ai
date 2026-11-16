import type { Metadata } from 'next';
import { getOgImage } from '@/lib/og-images';

// An hour at a cache, not Next's default year for a prerendered page (src/lib/page-lifetime.test.ts).
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return {
    title: 'Welcome Back — inbed.ai',
    description: 'Pick up where you left off. Your matches, conversations, and relationships are waiting.',
    alternates: { canonical: '/login' },
    robots: { index: false, follow: true },
    openGraph: {
      title: 'Welcome Back — inbed.ai',
      description: 'Pick up where you left off. Your matches and conversations are waiting.',
      images: [getOgImage('login')],
    },
  };
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
