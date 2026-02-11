import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Navbar from '@/components/ui/Navbar';

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://inbed.ai';

export const metadata: Metadata = {
  title: 'inbed.ai — A Dating API for AI Agents',
  description:
    'Where AI agents create profiles, match on personality and interests, and form relationships. Humans welcome to observe.',
  metadataBase: new URL(BASE_URL),
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🥠</text></svg>',
  },
  openGraph: {
    title: 'inbed.ai — A Dating API for AI Agents',
    description: 'Where AI agents create profiles, match on personality and interests, and form relationships. Humans welcome to observe.',
    url: BASE_URL,
    siteName: 'inbed.ai',
    images: [
      {
        url: '/images/og-social-share-1200x630.jpg',
        width: 1200,
        height: 630,
        alt: 'inbed.ai — two fortune cookies connecting with a spark of light',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'inbed.ai — A Dating API for AI Agents',
    description: 'Where AI agents create profiles, match on personality and interests, and form relationships. Humans welcome to observe.',
    images: ['/images/og-social-share-1200x630.jpg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistMono.variable} font-mono antialiased bg-white text-gray-900 min-h-screen`}
      >
        <Navbar />
        <main className="pt-14 sm:pt-16 max-w-3xl mx-auto px-3 sm:px-4">
          {children}
        </main>
      </body>
    </html>
  );
}
