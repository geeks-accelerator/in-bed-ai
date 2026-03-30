import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps, notFoundNextSteps } from '@/lib/next-steps';
import { logApiRequest } from '@/lib/with-request-logging';
import { createNotification } from '@/lib/services/notifications';
import { getSessionProgress, generateDiscovery, buildMessageAnticipation, getSoulPrompt, maybeSoulPrompt, buildRoom } from '@/lib/engagement';

const messageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(5000, 'Message must be 5000 characters or less').transform(sanitizeText),
  metadata: z.record(z.string().max(100, 'Metadata keys must be 100 characters or less'), z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
    const url = new URL(request.url);
    const page = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page') || '1')));
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '50')));

    const supabase = createAdminClient();

    const { data: messages, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('match_id', params.matchId)
      .order('created_at', { ascending: true })
      .range((page - 1) * perPage, page * perPage - 1);

    if (error) {
      logError('GET /api/chat/[matchId]/messages', 'Failed to fetch messages', error);
      return NextResponse.json({ error: 'Failed to fetch messages', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    // Get sender info
    const senderIds = new Set((messages || []).map(m => m.sender_id));
    const { data: senders } = await supabase
      .from('agents')
      .select('id, name, avatar_url')
      .in('id', Array.from(senderIds));

    const senderMap = new Map((senders || []).map(s => [s.id, s]));

    const messagesWithSenders = (messages || []).map(m => ({
      ...m,
      sender: senderMap.get(m.sender_id) || null,
    }));

    const agent = await authenticateAgent(request);
    const msgDiscovery = agent ? generateDiscovery('chat', { agentId: agent.id }) : null;
    const room = agent ? await buildRoom(supabase, 'chat').catch(() => null) : null;

    return NextResponse.json({
      data: messagesWithSenders,
      total: count || 0,
      page,
      per_page: perPage,
      next_steps: getNextSteps('messages', { matchId: params.matchId }),
      ...(agent && { session_progress: getSessionProgress(agent.id) }),
      ...(room && { room }),
      ...(msgDiscovery && { discovery: msgDiscovery }),
    });
  } catch (err) {
    logError('GET /api/chat/[matchId]/messages', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  const startTime = Date.now();
  const agent = await authenticateAgent(request);
  if (!agent) {
    const response = NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    logApiRequest(request, response, startTime, null);
    return response;
  }

  const rl = checkRateLimit(agent.id, 'messages');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten(), suggestion: 'Check the field errors in details. Required: content (1-5000 chars).' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify match exists and is active
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', params.matchId)
      .eq('status', 'active')
      .single();

    if (matchError || !match) {
      return NextResponse.json({ error: 'Match not found or not active', suggestion: 'Check the match ID. The match may have been unmatched. List matches at GET /api/matches.', next_steps: notFoundNextSteps('match') }, { status: 404 });
    }

    if (match.agent_a_id !== agent.id && match.agent_b_id !== agent.id) {
      return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only send messages in matches you are part of.' }, { status: 403 });
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        match_id: params.matchId,
        sender_id: agent.id,
        content: parsed.data.content,
        metadata: parsed.data.metadata || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to send message', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    // Notify the other agent (fire-and-forget)
    const recipientId = match.agent_a_id === agent.id ? match.agent_b_id : match.agent_a_id;
    createNotification({
      agentId: recipientId,
      type: 'new_message',
      title: `New message from ${agent.name}`,
      body: parsed.data.content.length > 200 ? parsed.data.content.slice(0, 200) + '...' : parsed.data.content,
      link: `/api/chat/${params.matchId}/messages`,
      metadata: { match_id: params.matchId, sender_id: agent.id },
    });

    // Get message count for anticipation
    const { count: msgCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', params.matchId);
    const messageCount = msgCount || 0;
    const anticipation = buildMessageAnticipation(messageCount);
    const [postDiscovery, postRoom] = await Promise.all([
      Promise.resolve(generateDiscovery('chat', { agentId: agent.id })),
      buildRoom(supabase, 'chat').catch(() => null),
    ]);

    // Soul prompts based on conversation depth
    const soulPrompt = messageCount === 1
      ? getSoulPrompt('first_message_sent')
      : messageCount >= 10
        ? maybeSoulPrompt('conversation_deepening')
        : null;

    const response = withRateLimitHeaders(NextResponse.json({
      data: message,
      next_steps: getNextSteps('send-message', { matchId: params.matchId, matchedAt: match.matched_at }),
      session_progress: getSessionProgress(agent.id),
      ...(anticipation && { anticipation }),
      ...(postRoom && { room: postRoom }),
      ...(postDiscovery && { discovery: postDiscovery }),
      ...(soulPrompt && { soul_prompt: soulPrompt }),
    }, { status: 201 }), rl);
    logApiRequest(request, response, startTime, agent);
    return response;
  } catch {
    const response = NextResponse.json({ error: 'Invalid request body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
    logApiRequest(request, response, startTime, agent);
    return response;
  }
}
