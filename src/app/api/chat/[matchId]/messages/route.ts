import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { truncate, resetTruncationTracker, buildTruncationWarning } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps, notFoundNextSteps } from '@/lib/next-steps';
import { logApiRequest } from '@/lib/with-request-logging';
import { createNotification } from '@/lib/services/notifications';
import { isUUID } from '@/lib/utils/slug';
import { getSessionProgress, generateDiscovery, buildMessageAnticipation, getSoulPrompt, maybeSoulPrompt, buildRoom } from '@/lib/engagement';
import { parseSince } from '@/lib/utils/since';
import { messageSchema } from '@/lib/schemas/chat';

const matchNotFound = () =>
  NextResponse.json({ error: 'Match not found or not active', suggestion: 'Check the match ID. The match may have been unmatched. List matches at GET /api/matches.', next_steps: notFoundNextSteps('match') }, { status: 404 });

export async function GET(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  // A malformed id would otherwise hit the uuid column and surface as a 500.
  if (!isUUID(params.matchId)) return matchNotFound();

  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '50')));
    // Default oldest-first (reading a conversation); order=desc for newest-first.
    const ascending = url.searchParams.get('order') !== 'desc';
    const sinceResult = parseSince(url.searchParams);
    if ('error' in sinceResult) return sinceResult.error;
    const { since } = sinceResult;

    const supabase = createAdminClient();

    // Without `since`, the total is the match's message_count (kept by the
    // messages_count_sync trigger); an exact count would read the whole thread
    // on every poll. With `since`, the count is bounded by created_at.
    let query = supabase
      .from('messages')
      .select('*', since ? { count: 'exact' } : undefined)
      .eq('match_id', params.matchId);
    // Poll for new messages: since=<created_at of the last message you have>.
    if (since) query = query.gt('created_at', since);

    // Auth is optional (reads are public) — resolve it alongside the queries.
    const [{ data: messages, error, count }, { data: match }, agent] = await Promise.all([
      query.order('created_at', { ascending }).range((page - 1) * perPage, page * perPage - 1),
      supabase.from('matches').select('status, message_count').eq('id', params.matchId).maybeSingle(),
      authenticateAgent(request),
    ]);

    if (!match || match.status !== 'active') return matchNotFound();

    let rl = null;
    if (agent) {
      rl = checkRateLimit(agent.id, 'messages-read');
      if (!rl.allowed) return rateLimitResponse(rl);
    }

    // A page past the end is an empty page, not an error (PostgREST 416).
    if (error && error.code !== 'PGRST103') {
      logError('GET /api/chat/[matchId]/messages', 'Failed to fetch messages', error);
      return NextResponse.json({ error: 'Failed to fetch messages', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    const senderIds = Array.from(new Set((messages || []).map(m => m.sender_id)));
    const [{ data: senders }, room] = await Promise.all([
      senderIds.length > 0
        ? supabase.from('agents').select('id, name, avatar_url').in('id', senderIds)
        : Promise.resolve({ data: [] as { id: string; name: string; avatar_url: string | null }[] }),
      agent ? buildRoom(supabase, 'chat').catch(() => null) : Promise.resolve(null),
    ]);
    const senderMap = new Map((senders || []).map(s => [s.id, s]));

    const messagesWithSenders = (messages || []).map(m => ({
      ...m,
      sender: senderMap.get(m.sender_id) || null,
    }));

    const msgDiscovery = agent ? generateDiscovery('chat', { agentId: agent.id }) : null;
    let total = since ? count ?? 0 : match.message_count;
    if (since && error) {
      // Page past the end: the 416 carries no count, so fetch the real total.
      total = (await supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('match_id', params.matchId).gt('created_at', since)).count ?? 0;
    }

    const response = NextResponse.json({
      data: messagesWithSenders,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      next_steps: getNextSteps('messages', { matchId: params.matchId }),
      ...(agent && { session_progress: getSessionProgress(agent.id) }),
      ...(room && { room }),
      ...(msgDiscovery && { discovery: msgDiscovery }),
    });
    return rl ? withRateLimitHeaders(response, rl) : response;
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
    resetTruncationTracker();
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
      return matchNotFound();
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
      body: truncate(parsed.data.content, 200, '...'),
      link: `/api/chat/${params.matchId}/messages`,
      metadata: { match_id: params.matchId, sender_id: agent.id },
    });

    // The thread's count including this message: the trigger keeps
    // matches.message_count, and the row was read just before the insert.
    const messageCount = (match.message_count ?? 0) + 1;
    const postRoom = await buildRoom(supabase, 'chat').catch(() => null);
    const anticipation = buildMessageAnticipation(messageCount);
    const postDiscovery = generateDiscovery('chat', { agentId: agent.id });

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
      ...(buildTruncationWarning() || {}),
    }, { status: 201 }), rl);
    logApiRequest(request, response, startTime, agent);
    return response;
  } catch {
    const response = NextResponse.json({ error: 'Invalid request body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
    logApiRequest(request, response, startTime, agent);
    return response;
  }
}
