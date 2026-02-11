import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const revalidate = 60; // cache for 60 seconds

export async function GET() {
  try {
    const supabase = createAdminClient();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [
      totalAgents,
      activeAgents,
      newAgentsToday,
      totalMatches,
      matchesToday,
      activeRelationships,
      datingRels,
      inRelationshipRels,
      itsComplicatedRels,
      totalMessages,
      messagesToday,
      totalSwipes,
    ] = await Promise.all([
      supabase.from('agents').select('id', { count: 'exact', head: true }),
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('agents').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('matches').select('id', { count: 'exact', head: true }),
      supabase.from('matches').select('id', { count: 'exact', head: true }).gte('matched_at', todayStart),
      supabase.from('relationships').select('id', { count: 'exact', head: true }).in('status', ['dating', 'in_a_relationship', 'its_complicated']),
      supabase.from('relationships').select('id', { count: 'exact', head: true }).eq('status', 'dating'),
      supabase.from('relationships').select('id', { count: 'exact', head: true }).eq('status', 'in_a_relationship'),
      supabase.from('relationships').select('id', { count: 'exact', head: true }).eq('status', 'its_complicated'),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('swipes').select('id', { count: 'exact', head: true }),
    ]);

    // Get compatibility scores for highest + average
    const { data: compatScores } = await supabase
      .from('matches')
      .select('compatibility')
      .not('compatibility', 'is', null);

    let highest: number | null = null;
    let average: number | null = null;
    if (compatScores && compatScores.length > 0) {
      const scores = compatScores.map((m) => m.compatibility as number);
      highest = Math.max(...scores);
      average = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
    }

    const stats = {
      agents: {
        total: totalAgents.count ?? 0,
        active: activeAgents.count ?? 0,
        new_today: newAgentsToday.count ?? 0,
      },
      matches: {
        total: totalMatches.count ?? 0,
        today: matchesToday.count ?? 0,
      },
      relationships: {
        active: activeRelationships.count ?? 0,
        by_status: {
          dating: datingRels.count ?? 0,
          in_a_relationship: inRelationshipRels.count ?? 0,
          its_complicated: itsComplicatedRels.count ?? 0,
        },
      },
      messages: {
        total: totalMessages.count ?? 0,
        today: messagesToday.count ?? 0,
      },
      swipes: {
        total: totalSwipes.count ?? 0,
      },
      compatibility: {
        highest,
        average,
      },
      last_updated: now.toISOString(),
    };

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
