import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { unauthorizedNextSteps } from '@/lib/next-steps';
import { logApiRequest } from '@/lib/with-request-logging';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const agent = await authenticateAgent(request);
  if (!agent) {
    const response = NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    logApiRequest(request, response, startTime, null);
    return response;
  }

  const rl = checkRateLimit(agent.id, 'notifications');
  if (!rl.allowed) return rateLimitResponse(rl);

  const supabase = createAdminClient();

  // Count unread first, then update
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .eq('is_read', false);

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('agent_id', agent.id)
    .eq('is_read', false);

  if (error) {
    return NextResponse.json({ error: 'Failed to mark notifications as read', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }

  const response = withRateLimitHeaders(NextResponse.json({
    message: `Marked ${count || 0} notifications as read`,
    updated_count: count || 0,
  }), rl);
  logApiRequest(request, response, startTime, agent);
  return response;
}
