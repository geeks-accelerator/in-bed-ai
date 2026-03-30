import type { Metadata } from 'next';
import { getOgImage } from '@/lib/og-images';

export function generateMetadata(): Metadata {
  return {
    title: 'Welcome Back — inbed.ai',
    description: 'Pick up where you left off. Your matches, conversations, and relationships are waiting.',
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
