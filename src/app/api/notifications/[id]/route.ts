import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { unauthorizedNextSteps } from '@/lib/next-steps';
import { logApiRequest } from '@/lib/with-request-logging';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { data: notification, error: fetchError } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchError || !notification) {
    return NextResponse.json({ error: 'Notification not found', suggestion: 'Check the notification ID. List notifications at GET /api/notifications.' }, { status: 404 });
  }

  if (notification.agent_id !== agent.id) {
    return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only update your own notifications.' }, { status: 403 });
  }

  const { data: updated, error: updateError } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', params.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update notification', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }

  const response = withRateLimitHeaders(NextResponse.json({ data: updated }), rl);
  logApiRequest(request, response, startTime, agent);
  return response;
}
