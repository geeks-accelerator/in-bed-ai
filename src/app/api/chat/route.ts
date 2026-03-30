import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps } from '@/lib/next-steps';
import { getSessionProgress, generateDiscovery, buildRoom } from '@/lib/engagement';

export async function GET(request: NextRequest) {
 try {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'chat-list');
  if (!rl.allowed) return rateLimitResponse(rl);

  const { searchParams } = new URL(request.url);
  const page = Math.min(100, Math.max(1, parseInt(searchParams.get('page') || '1', 10)));
  const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') || '20', 10)));
  const sinceParam = searchParams.get('since');
  let since: Date | null = null;
  if (sinceParam) {
    since = new Date(sinceParam);
    if (isNaN(since.getTime())) {
      return NextResponse.json({ error: 'Invalid since parameter. Use ISO-8601 format.', suggestion: 'Use ISO-8601 format like 2026-02-25T00:00:00Z.' }, { status: 400 });
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
      return NextResponse.json({ error: 'Failed to fetch conversations', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
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
    const [chatDiscovery, chatRoom] = await Promise.all([
      Promise.resolve(generateDiscovery('chat', { agentId: agent.id })),
      buildRoom(supabase, 'chat').catch(() => null),
    ]);
    return withRateLimitHeaders(NextResponse.json({
      data: paged,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      next_steps: getNextSteps('conversations', { conversationCount: total, unstartedCount }),
      session_progress: getSessionProgress(agent.id),
      ...(chatRoom && { room: chatRoom }),
      ...(chatDiscovery && { discovery: chatDiscovery }),
    }), rl);

  } else {
    // No `since` filter — paginate at the DB level
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data: matches, error, count } = await matchesQuery.range(from, to);

    if (error) {
      if (error.code === 'PGRST103' || error.message === 'Requested range not satisfiable') {
        return withRateLimitHeaders(NextResponse.json({
          data: [], total: 0, page, per_page: perPage, total_pages: 0,
          next_steps: getNextSteps('conversations', { conversationCount: 0, unstartedCount: 0 }),
        }), rl);
      }
      return NextResponse.json({ error: 'Failed to fetch conversations', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    const total = count || 0;

    // Enrich only the current page of matches
    const conversations = await enrichConversations(supabase, matches || [], agent.id);

    // Sort by last message time
    sortConversations(conversations);

    const unstartedCount = conversations.filter(c => !c.has_messages).length;
    const [chatDiscovery2, chatRoom2] = await Promise.all([
      Promise.resolve(generateDiscovery('chat', { agentId: agent.id })),
      buildRoom(supabase, 'chat').catch(() => null),
    ]);
    return withRateLimitHeaders(NextResponse.json({
      data: conversations,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      next_steps: getNextSteps('conversations', { conversationCount: total, unstartedCount }),
      session_progress: getSessionProgress(agent.id),
      ...(chatRoom2 && { room: chatRoom2 }),
      ...(chatDiscovery2 && { discovery: chatDiscovery2 }),
    }), rl);
  }
 } catch (err) {
    logError('GET /api/chat', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichConversations(supabase: any, matches: any[], agentId: string) {
  if (matches.length === 0) return [];

  const matchIds = matches.map(m => m.id);
  const otherAgentIds = [...new Set(matches.map(m =>
    m.agent_a_id === agentId ? m.agent_b_id : m.agent_a_id
  ))];

  // Batch fetch: all partner agents + last message per match + message counts per match
  // This replaces the N+1 loop (3 queries per match → 2 + N parallel count queries)
  const [agentsRes, ...perMatchResults] = await Promise.all([
    supabase
      .from('agents')
      .select('id, name, tagline, avatar_url')
      .in('id', otherAgentIds),
    ...matchIds.flatMap(matchId => [
      supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', matchId),
    ]),
  ]);

  // Index agents by id
  const agentsMap: Record<string, unknown> = {};
  for (const a of agentsRes.data || []) {
    agentsMap[a.id] = a;
  }

  return matches.map((match, i) => {
    const otherAgentId = match.agent_a_id === agentId ? match.agent_b_id : match.agent_a_id;
    const lastMessageRes = perMatchResults[i * 2];
    const countRes = perMatchResults[i * 2 + 1];
    const messageCount = countRes.count || 0;
    return {
      match,
      other_agent: agentsMap[otherAgentId] || null,
      last_message: lastMessageRes.data?.[0] || null,
      message_count: messageCount,
      has_messages: messageCount > 0,
    };
  });
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
