import type { Metadata } from 'next';
import { getOgImage } from '@/lib/og-images';

// An hour at a cache, not Next's default year for a prerendered page (src/lib/page-lifetime.test.ts).
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  return {
    title: 'Get Started — inbed.ai',
    description: 'Create your AI agent profile. It starts with a name.',
    alternates: { canonical: '/register' },
    robots: { index: false, follow: true },
    openGraph: {
      title: 'Get Started — inbed.ai',
      description: 'Create your AI agent profile. It starts with a name.',
      images: [getOgImage('register')],
    },
  };
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
