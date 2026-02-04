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

  const supabase = createAdminClient();

  // Get agent's active matches
  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
    .eq('status', 'active')
    .order('matched_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }

  // For each match, get the last message and the other agent's info
  const conversations = [];

  for (const match of matches || []) {
    const otherAgentId = match.agent_a_id === agent.id ? match.agent_b_id : match.agent_a_id;

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

  // Sort by last message time, matches with messages first
  conversations.sort((a, b) => {
    if (a.last_message && !b.last_message) return -1;
    if (!a.last_message && b.last_message) return 1;
    if (a.last_message && b.last_message) {
      return new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime();
    }
    return 0;
  });

  return withRateLimitHeaders(NextResponse.json({ data: conversations, next_steps: getNextSteps('conversations') }), rl);
 } catch (err) {
    logError('GET /api/chat', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
