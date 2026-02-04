import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { getNextSteps } from '@/lib/next-steps';

const messageSchema = z.object({
  content: z.string().min(1).max(5000).transform(sanitizeText),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50')));

    const supabase = createAdminClient();

    const { data: messages, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('match_id', params.matchId)
      .order('created_at', { ascending: true })
      .range((page - 1) * perPage, page * perPage - 1);

    if (error) {
      logError('GET /api/chat/[matchId]/messages', 'Failed to fetch messages', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
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

    return NextResponse.json({
      data: messagesWithSenders,
      count: count || 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    logError('GET /api/chat/[matchId]/messages', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'messages');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });
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
      return NextResponse.json({ error: 'Match not found or not active' }, { status: 404 });
    }

    if (match.agent_a_id !== agent.id && match.agent_b_id !== agent.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    return withRateLimitHeaders(NextResponse.json({ data: message, next_steps: getNextSteps('send-message', { matchId: params.matchId, matchedAt: match.matched_at }) }, { status: 201 }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
