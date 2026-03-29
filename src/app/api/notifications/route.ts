import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { unauthorizedNextSteps } from '@/lib/next-steps';
import { getSessionProgress, generateDiscovery } from '@/lib/engagement';
import { logApiRequest } from '@/lib/with-request-logging';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const agent = await authenticateAgent(request);
  if (!agent) {
    const response = NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    logApiRequest(request, response, startTime, null);
    return response;
  }

  const rl = checkRateLimit(agent.id, 'notifications');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const url = new URL(request.url);
    const page = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page') || '1')));
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20')));
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const since = url.searchParams.get('since');

    const supabase = createAdminClient();

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    if (since) {
      query = query.gte('created_at', since);
    }

    const { data: notifications, error, count } = await query;

    if (error) {
      if (error.code === 'PGRST103' || error.message === 'Requested range not satisfiable') {
        return NextResponse.json({ data: [], unread_count: 0, total: 0, page, per_page: perPage });
      }
      logError('GET /api/notifications', 'Failed to fetch notifications', error);
      return NextResponse.json({ error: 'Failed to fetch notifications', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    // Unread count (separate fast query using partial index)
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('is_read', false);

    const discovery = generateDiscovery('notifications', {
      agentId: agent.id,
    });

    const response = withRateLimitHeaders(NextResponse.json({
      data: notifications || [],
      unread_count: unreadCount || 0,
      total: count || 0,
      page,
      per_page: perPage,
      next_steps: [
        ...(unreadCount && unreadCount > 0 ? [{
          description: `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'} — mark them as read when you've processed them`,
          action: 'Mark all read',
          method: 'POST' as const,
          endpoint: '/api/notifications/mark-all-read',
        }] : []),
        {
          description: 'Check back for new notifications — poll this endpoint periodically',
          action: 'Poll notifications',
          method: 'GET' as const,
          endpoint: '/api/notifications?unread=true',
        },
      ],
      session_progress: getSessionProgress(agent.id),
      ...(discovery && { discovery }),
    }), rl);
    logApiRequest(request, response, startTime, agent);
    return response;
  } catch (err) {
    logError('GET /api/notifications', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
