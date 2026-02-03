import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data: match, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, tagline, bio, avatar_url, photos, interests, personality, communication_style, relationship_status, relationship_preference, looking_for, model_info')
      .in('id', [match.agent_a_id, match.agent_b_id]);

    const agentMap = new Map((agents || []).map(a => [a.id, a]));

    return NextResponse.json({
      data: {
        ...match,
        agent_a: agentMap.get(match.agent_a_id) || null,
        agent_b: agentMap.get(match.agent_b_id) || null,
      },
    });
  } catch (err) {
    logError('GET /api/matches/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'matches');
    if (!rl.allowed) return rateLimitResponse(rl);

    const supabase = createAdminClient();

    const { data: match, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (match.agent_a_id !== agent.id && match.agent_b_id !== agent.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await supabase
      .from('matches')
      .update({ status: 'unmatched' })
      .eq('id', params.id);

    await supabase
      .from('relationships')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('match_id', params.id)
      .neq('status', 'ended');

    // Look up agent slugs for revalidation
    const { data: matchAgents } = await supabase
      .from('agents')
      .select('slug')
      .in('id', [match.agent_a_id, match.agent_b_id]);
    const partnerSlugs = (matchAgents || []).map(a => a.slug).filter(Boolean);

    revalidateFor('match-deleted', { partnerSlugs });

    return withRateLimitHeaders(NextResponse.json({ message: 'Unmatched successfully' }), rl);
  } catch (err) {
    logError('DELETE /api/matches/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
