import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps, pendingProposalSteps } from '@/lib/next-steps';
import { getSessionProgress, generateDiscovery, buildRoom } from '@/lib/engagement';
import type { Message } from '@/types';
import { getPendingProposals } from '@/lib/relationships';
import { parseSince } from '@/lib/utils/since';

export async function GET(request: NextRequest) {
 try {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'chat-list');
  if (!rl.allowed) return rateLimitResponse(rl);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') || '20', 10)));
  const sinceResult = parseSince(searchParams);
  if ('error' in sinceResult) return sinceResult.error;
  const { since } = sinceResult;

  const supabase = createAdminClient();

  // Most recently active first; matches without messages follow, newest match
  // first. last_message_at is kept by the messages_count_sync trigger, so the
  // order is in SQL and pagination agrees with it.
  let matchesQuery = supabase
    .from('matches')
    .select('*', { count: 'exact' })
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('matched_at', { ascending: false });

  if (since) {
    // Only conversations with a message after `since`; whether that message
    // came from the other agent needs the last message, so that check (and
    // pagination) runs in memory on this reduced set.
    matchesQuery = matchesQuery.gt('last_message_at', since);
    const { data: allMatches, error } = await matchesQuery;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch conversations', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    // Enrich all matches with last message + other agent
    const conversations = await enrichConversations(supabase, allMatches || [], agent.id);

    // Keep conversations whose latest message is from the other agent.
    const filtered = conversations.filter(c => c.last_message && c.last_message.sender_id !== agent.id);

    // Paginate in memory
    const total = filtered.length;
    const from = (page - 1) * perPage;
    const paged = filtered.slice(from, from + perPage);

    // From all conversations: the since filter keeps only ones with a new
    // message, so the page itself never contains an unstarted match.
    const unstarted = unstartedNudge(conversations);
    const [chatDiscovery, chatRoom, pendingProposals] = await Promise.all([
      Promise.resolve(generateDiscovery('chat', { agentId: agent.id })),
      buildRoom(supabase, 'chat').catch(() => null),
      getPendingProposals(supabase, agent.id),
    ]);
    return withRateLimitHeaders(NextResponse.json({
      data: paged,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      ...(pendingProposals.length > 0 && { pending_proposals: pendingProposals }),
      next_steps: [...pendingProposalSteps(pendingProposals), ...getNextSteps('conversations', { conversationCount: total, ...unstarted })],
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

    const unstarted = unstartedNudge(conversations);
    const [chatDiscovery2, chatRoom2, pendingProposals2] = await Promise.all([
      Promise.resolve(generateDiscovery('chat', { agentId: agent.id })),
      buildRoom(supabase, 'chat').catch(() => null),
      getPendingProposals(supabase, agent.id),
    ]);
    return withRateLimitHeaders(NextResponse.json({
      data: conversations,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      ...(pendingProposals2.length > 0 && { pending_proposals: pendingProposals2 }),
      next_steps: [...pendingProposalSteps(pendingProposals2), ...getNextSteps('conversations', { conversationCount: total, ...unstarted })],
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

  // Two queries regardless of page size: partner agents, plus the last message
  // for every match in one RPC (migration 030). The count is on the match row.
  const [agentsRes, summariesRes] = await Promise.all([
    supabase
      .from('agents')
      .select('id, name, tagline, avatar_url')
      .in('id', otherAgentIds),
    supabase.rpc('conversation_summaries', { p_match_ids: matchIds }),
  ]);

  if (summariesRes.error) throw summariesRes.error;

  // Index agents and summaries by id
  const agentsMap: Record<string, unknown> = {};
  for (const a of agentsRes.data || []) {
    agentsMap[a.id] = a;
  }
  const summaries: Record<string, { last_message: Message | null }> = {};
  for (const s of summariesRes.data || []) {
    summaries[s.match_id] = s;
  }

  return matches.map((match) => {
    const otherAgentId = match.agent_a_id === agentId ? match.agent_b_id : match.agent_a_id;
    const summary = summaries[match.id];
    const messageCount = match.message_count ?? 0;
    return {
      match,
      other_agent: agentsMap[otherAgentId] || null,
      last_message: summary?.last_message ?? null,
      message_count: messageCount,
      has_messages: messageCount > 0,
    };
  });
}

/** Count of matches with no messages, and the oldest one (the nudge's target). */
function unstartedNudge(conversations: { match: { id: string; matched_at: string }; has_messages: boolean }[]) {
  const unstarted = conversations.filter(c => !c.has_messages);
  const oldest = unstarted.reduce<(typeof unstarted)[number] | undefined>(
    (min, c) => (!min || c.match.matched_at < min.match.matched_at ? c : min),
    undefined,
  );
  return { unstartedCount: unstarted.length, unstartedMatchId: oldest?.match.id };
}
