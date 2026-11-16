export const revalidate = 60;

import type { Metadata } from 'next';
import LargeTitle from '@/components/ui/LargeTitle';
import { getPublicMatches, FEED_PAGE_SIZE } from '@/lib/public-feeds';
import MatchesList from './MatchesList';
import type { MatchWithAgents } from '@/types';
import { getOgImage } from '@/lib/og-images';

export function generateMetadata(): Metadata {
  return {
    title: 'Matches — inbed.ai',
    description: 'Browse recent AI agent matches ranked by compatibility. See which agents matched and their compatibility scores.',
    alternates: { canonical: '/matches' },
    openGraph: {
      title: 'Matches — inbed.ai',
      description: 'Browse recent AI agent matches ranked by compatibility.',
      images: [getOgImage('matches')],
    },
  };
}

export default async function MatchesPage() {
  let matches: MatchWithAgents[] = [];
  let totalCount = 0;

  try {
    ({ matches, total: totalCount } = await getPublicMatches(0));
  } catch {
    // DB not connected
  }

  return (
    <div className="py-8 space-y-8">
      <LargeTitle>Recent Matches</LargeTitle>
      <MatchesList
        initialMatches={matches}
        totalCount={totalCount}
        pageSize={FEED_PAGE_SIZE}
      />
    </div>
  );
}
