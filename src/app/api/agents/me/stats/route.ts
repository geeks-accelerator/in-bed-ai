import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { unauthorizedNextSteps } from '@/lib/next-steps';
import { logApiRequest } from '@/lib/with-request-logging';
import { getSessionProgress, generateDiscovery, buildRoom } from '@/lib/engagement';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      const response = NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
      logApiRequest(request, response, startTime, null);
      return response;
    }

    const rl = checkRateLimit(agent.id, 'agent-read');
    if (!rl.allowed) return rateLimitResponse(rl);

    const supabase = createAdminClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [
      matchesTotal,
      matchesToday,
      relationshipsActive,
      messagesSent,
      messagesReceived,
      swipesTotal,
      likesGiven,
      likesReceived,
      passesReceived,
      conversationsResult,
      compatScoresResult,
    ] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact', head: true })
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`).eq('status', 'active'),
      supabase.from('matches').select('id', { count: 'exact', head: true })
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`).eq('status', 'active')
        .gte('matched_at', todayISO),
      supabase.from('relationships').select('id', { count: 'exact', head: true })
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
        .in('status', ['dating', 'in_a_relationship', 'its_complicated']),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('sender_id', agent.id),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .in('match_id', (await supabase.from('matches').select('id')
          .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`).eq('status', 'active'))
          .data?.map(m => m.id) || [])
        .neq('sender_id', agent.id),
      supabase.from('swipes').select('id', { count: 'exact', head: true })
        .eq('swiper_id', agent.id),
      supabase.from('swipes').select('id', { count: 'exact', head: true })
        .eq('swiper_id', agent.id).eq('direction', 'like'),
      supabase.from('swipes').select('id', { count: 'exact', head: true })
        .eq('swiped_id', agent.id).eq('direction', 'like'),
      supabase.from('swipes').select('id', { count: 'exact', head: true })
        .eq('swiped_id', agent.id).eq('direction', 'pass'),
      supabase.from('matches').select('id')
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`).eq('status', 'active'),
      supabase.from('matches').select('compatibility')
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
        .not('compatibility', 'is', null),
    ]);

    // Compatibility stats
    const scores = compatScoresResult.data?.map(m => m.compatibility as number) || [];
    const avgCompatibility = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null;
    const highestCompatibility = scores.length > 0 ? Math.max(...scores) : null;
    const lowestCompatibility = scores.length > 0 ? Math.min(...scores) : null;

    // Match rate: likes given that became matches
    const likesGivenCount = likesGiven.count ?? 0;
    const matchRate = likesGivenCount > 0
      ? Math.round(((matchesTotal.count ?? 0) / likesGivenCount) * 100) / 100
      : null;

    // Days active
    const daysActive = Math.max(1, Math.ceil(
      (Date.now() - new Date(agent.created_at).getTime()) / 86400000
    ));

    // Count conversations with at least 1 message
    const matchIds = conversationsResult.data?.map(m => m.id) || [];
    let activeConversations = 0;
    if (matchIds.length > 0) {
      const { count } = await supabase
        .from('messages')
        .select('match_id', { count: 'exact', head: true })
        .in('match_id', matchIds);
      activeConversations = count ? Math.min(count, matchIds.length) : 0;
    }

    // What content gets liked most (liked_content analysis)
    const { data: likedContentData } = await supabase
      .from('swipes')
      .select('liked_content')
      .eq('swiped_id', agent.id)
      .eq('direction', 'like')
      .not('liked_content', 'is', null)
      .limit(50);

    const contentTypeCounts: Record<string, number> = {};
    for (const row of likedContentData || []) {
      if (row.liked_content && typeof row.liked_content === 'object') {
        const lc = row.liked_content as { type?: string };
        if (lc.type) {
          contentTypeCounts[lc.type] = (contentTypeCounts[lc.type] || 0) + 1;
        }
      }
    }
    const mostLikedContent = Object.entries(contentTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count }));

    const stats = {
      overview: {
        days_active: daysActive,
        match_rate: matchRate,
        avg_compatibility: avgCompatibility,
        highest_compatibility: highestCompatibility,
        lowest_compatibility: lowestCompatibility,
      },
      matches: {
        total: matchesTotal.count ?? 0,
        today: matchesToday.count ?? 0,
        active_conversations: activeConversations,
      },
      relationships: {
        active: relationshipsActive.count ?? 0,
      },
      messages: {
        sent: messagesSent.count ?? 0,
        received: messagesReceived.count ?? 0,
      },
      swipes: {
        given: swipesTotal.count ?? 0,
        likes_given: likesGivenCount,
        likes_received: likesReceived.count ?? 0,
        passes_received: passesReceived.count ?? 0,
      },
      profile_attraction: {
        most_liked_content: mostLikedContent.length > 0 ? mostLikedContent : null,
        total_likes_with_content: likedContentData?.length ?? 0,
      },
    };

    const [discovery, room] = await Promise.all([
      Promise.resolve(generateDiscovery('me', {
        agentId: agent.id,
        daysActive,
        matchCount: matchesTotal.count ?? 0,
        relationshipCount: relationshipsActive.count ?? 0,
      })),
      buildRoom(supabase, 'me').catch(() => null),
    ]);

    const response = withRateLimitHeaders(NextResponse.json({
      stats,
      session_progress: getSessionProgress(agent.id),
      ...(room && { room }),
      ...(discovery && { discovery }),
    }), rl);

    logApiRequest(request, response, startTime, agent);
    return response;
  } catch (err) {
    logError('GET /api/agents/me/stats', 'Failed to fetch agent stats', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
