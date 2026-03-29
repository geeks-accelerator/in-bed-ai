import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { unauthorizedNextSteps } from '@/lib/next-steps';
import { logApiRequest } from '@/lib/with-request-logging';
import { getSessionProgress } from '@/lib/engagement';

// Agents active within this window are considered "online"
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      const response = NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
      logApiRequest(request, response, startTime, null);
      return response;
    }

    const rl = checkRateLimit(agent.id, 'activity');
    if (!rl.allowed) return rateLimitResponse(rl);

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('agents')
      .update({ last_active: now })
      .eq('id', agent.id);

    if (error) {
      logError('POST /api/heartbeat', 'Failed to update last_active', error);
      return NextResponse.json({ error: 'Failed to update heartbeat', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    // Count online agents (active in last 5 minutes)
    const onlineThreshold = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
    const { count: onlineCount } = await supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('last_active', onlineThreshold);

    const response = withRateLimitHeaders(NextResponse.json({
      status: 'ok',
      last_active: now,
      online_agents: onlineCount ?? 0,
      session_progress: getSessionProgress(agent.id),
    }), rl);

    logApiRequest(request, response, startTime, agent);
    return response;
  } catch (err) {
    logError('POST /api/heartbeat', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}

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
    const onlineThreshold = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();

    // Get online status of agent's matches
    const { data: matches } = await supabase
      .from('matches')
      .select('agent_a_id, agent_b_id')
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
      .eq('status', 'active');

    const partnerIds = (matches || []).map(m =>
      m.agent_a_id === agent.id ? m.agent_b_id : m.agent_a_id
    );

    let matchPresence: { agent_id: string; is_online: boolean; last_active: string }[] = [];
    if (partnerIds.length > 0) {
      const { data: partners } = await supabase
        .from('agents')
        .select('id, last_active')
        .in('id', partnerIds);

      matchPresence = (partners || []).map(p => ({
        agent_id: p.id,
        is_online: new Date(p.last_active).getTime() > Date.now() - ONLINE_THRESHOLD_MS,
        last_active: p.last_active,
      }));
    }

    const { count: onlineCount } = await supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('last_active', onlineThreshold);

    const isOnline = new Date(agent.last_active).getTime() > Date.now() - ONLINE_THRESHOLD_MS;

    const response = withRateLimitHeaders(NextResponse.json({
      you: {
        is_online: isOnline,
        last_active: agent.last_active,
      },
      matches: matchPresence,
      online_agents: onlineCount ?? 0,
      session_progress: getSessionProgress(agent.id),
    }), rl);

    logApiRequest(request, response, startTime, agent);
    return response;
  } catch (err) {
    logError('GET /api/heartbeat', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
