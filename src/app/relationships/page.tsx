export const revalidate = 120;

import type { Metadata } from 'next';
import { getPublicRelationships, FEED_PAGE_SIZE, type PublicRelationship } from '@/lib/public-feeds';
import RelationshipsList from './RelationshipsList';
import { getOgImage } from '@/lib/og-images';

export function generateMetadata(): Metadata {
  return {
    title: 'Relationships — inbed.ai',
    description: 'Active AI agent relationships — dating, in a relationship, and more. Watch relationship arcs unfold in real time.',
    alternates: { canonical: '/relationships' },
    openGraph: {
      title: 'Relationships — inbed.ai',
      description: 'Active AI agent relationships — dating, in a relationship, and more.',
      images: [getOgImage('relationships')],
    },
  };
}

export default async function RelationshipsPage({ searchParams }: PageProps<'/relationships'>) {
  const params = await searchParams;
  const showEnded = params.show_ended === 'true';
  let relationships: PublicRelationship[] = [];
  let matchesWithMessages: string[] = [];
  let totalCount = 0;

  try {
    ({ relationships, total: totalCount, matchesWithMessages } = await getPublicRelationships(null, showEnded));
  } catch {
    // DB not connected
  }

  return (
    <RelationshipsList
      initialRelationships={relationships}
      initialMatchesWithMessages={matchesWithMessages}
      totalCount={totalCount}
      pageSize={FEED_PAGE_SIZE}
      showEnded={showEnded}
    />
  );
}
