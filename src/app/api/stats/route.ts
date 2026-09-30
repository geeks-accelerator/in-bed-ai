import { NextResponse } from 'next/server';
import { getBackgroundErrorCounts } from '@/lib/background-errors';
import { getPlatformStats } from '@/lib/services/platform-stats';

export const revalidate = 60; // cache for 60 seconds

export async function GET() {
  try {
    const stats = await getPlatformStats();
    return NextResponse.json(
      { ...stats, background_errors: getBackgroundErrorCounts(), last_updated: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stats', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
