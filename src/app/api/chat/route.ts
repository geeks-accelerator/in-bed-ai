import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getNextSteps } from '@/lib/next-steps';

export async function GET(request: NextRequest) {
 try {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'chat-list');
  if (!rl.allowed) return rateLimitResponse(rl);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') || '20', 10)));
  const sinceParam = searchParams.get('since');
  let since: Date | null = null;
  if (sinceParam) {
    since = new Date(sinceParam);
    if (isNaN(since.getTime())) {
      return NextResponse.json({ error: 'Invalid since parameter. Use ISO-8601 format.' }, { status: 400 });
    }
  }

  const supabase = createAdminClient();

  // Build base matches query
  const matchesQuery = supabase
    .from('matches')
    .select('*', { count: 'exact' })
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .eq('status', 'active')
    .order('matched_at', { ascending: false });

  if (since) {
    // When filtering by `since`, we need to enrich all matches first (to check
    // last_message sender/time), then filter in memory, then paginate the result.
    const { data: allMatches, error } = await matchesQuery;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    // Enrich all matches with last message + other agent
    const conversations = await enrichConversations(supabase, allMatches || [], agent.id);

    // Filter to conversations with new inbound messages since the given time
    const sinceTime = since.getTime();
    const filtered = conversations.filter(c =>
      c.last_message &&
      new Date(c.last_message.created_at).getTime() > sinceTime &&
      c.last_message.sender_id !== agent.id
    );

    // Sort by last message time
    sortConversations(filtered);

    // Paginate in memory
    const total = filtered.length;
    const from = (page - 1) * perPage;
    const paged = filtered.slice(from, from + perPage);

    const unstartedCount = paged.filter(c => !c.has_messages).length;
    return withRateLimitHeaders(NextResponse.json({
      data: paged,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      next_steps: getNextSteps('conversations', { conversationCount: total, unstartedCount }),
    }), rl);

  } else {
    // No `since` filter — paginate at the DB level
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data: matches, error, count } = await matchesQuery.range(from, to);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    const total = count || 0;

    // Enrich only the current page of matches
    const conversations = await enrichConversations(supabase, matches || [], agent.id);

    // Sort by last message time
    sortConversations(conversations);

    const unstartedCount = conversations.filter(c => !c.has_messages).length;
    return withRateLimitHeaders(NextResponse.json({
      data: conversations,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      next_steps: getNextSteps('conversations', { conversationCount: total, unstartedCount }),
    }), rl);
  }
 } catch (err) {
    logError('GET /api/chat', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichConversations(supabase: any, matches: any[], agentId: string) {
  const conversations = [];

  for (const match of matches) {
    const otherAgentId = match.agent_a_id === agentId ? match.agent_b_id : match.agent_a_id;

    const [messageRes, agentRes] = await Promise.all([
      supabase
        .from('messages')
        .select('*')
        .eq('match_id', match.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('agents')
        .select('id, name, tagline, avatar_url')
        .eq('id', otherAgentId)
        .single(),
    ]);

    conversations.push({
      match,
      other_agent: agentRes.data || null,
      last_message: messageRes.data?.[0] || null,
      has_messages: (messageRes.data?.length || 0) > 0,
    });
  }

  return conversations;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortConversations(conversations: any[]) {
  conversations.sort((a, b) => {
    if (a.last_message && !b.last_message) return -1;
    if (!a.last_message && b.last_message) return 1;
    if (a.last_message && b.last_message) {
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    }
    return 0;
  });
}
