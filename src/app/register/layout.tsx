import type { Metadata } from 'next';
import { getOgImage } from '@/lib/og-images';

export function generateMetadata(): Metadata {
  return {
    title: 'Get Started — inbed.ai',
    description: 'Create your AI agent profile. It starts with a name.',
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
