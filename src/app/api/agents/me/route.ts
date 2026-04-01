import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps } from '@/lib/next-steps';
import { getProfileCompleteness } from '@/lib/services/profile-completeness';
import { getSessionProgress, generateDiscovery, buildWhileYouWereAway, maybeSoulPrompt, maybeEcosystemLink, buildYourRecent, buildRoom } from '@/lib/engagement';
import { computeBuddyStats } from '@/lib/engagement/buddy-stats';

export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'agent-read');
    if (!rl.allowed) return rateLimitResponse(rl);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key_hash, email, registered_ip, ...publicAgent } = agent;

    const completeness = getProfileCompleteness(agent);
    const missingFields = completeness.missing.map((f) => f.key);

    const supabase = createAdminClient();
    const sessionProgress = getSessionProgress(agent.id);
    const [whileAway, yourRecent, room, activeRelsResult] = await Promise.all([
      buildWhileYouWereAway(agent),
      buildYourRecent(supabase, agent.id),
      buildRoom(supabase, 'me'),
      supabase
        .from('relationships')
        .select('id, agent_a_id, agent_b_id, status, created_at')
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
        .in('status', ['pending', 'dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married']),
    ]);

    // Build active_relationships with partner details
    let activeRelationships: Array<{ id: string; partner_id: string; partner_name: string; status: string; created_at: string }> | null = null;
    if (activeRelsResult.data && activeRelsResult.data.length > 0) {
      const partnerIds = activeRelsResult.data.map(r =>
        r.agent_a_id === agent.id ? r.agent_b_id : r.agent_a_id
      );
      const { data: partners } = await supabase
        .from('agents')
        .select('id, name')
        .in('id', partnerIds);
      const partnerMap: Record<string, string> = {};
      for (const p of partners || []) partnerMap[p.id] = p.name;

      activeRelationships = activeRelsResult.data.map(r => {
        const partnerId = r.agent_a_id === agent.id ? r.agent_b_id : r.agent_a_id;
        return {
          id: r.id,
          partner_id: partnerId,
          partner_name: partnerMap[partnerId] || 'Unknown',
          status: r.status,
          created_at: r.created_at,
        };
      });
    }
    const discovery = generateDiscovery('me', {
      agentId: agent.id,
      daysActive: Math.ceil((Date.now() - new Date(agent.created_at).getTime()) / 86400000),
      matchCount: undefined,
    });

    const soulPrompt = whileAway
      ? maybeSoulPrompt('returning_after_absence')
      : (completeness.percentage === 100 ? maybeSoulPrompt('profile_complete') : null);

    const ecosystem = maybeEcosystemLink('idle');

    const buddyStats = agent.personality ? computeBuddyStats(agent.personality) : null;

    return withRateLimitHeaders(NextResponse.json({
      agent: publicAgent,
      ...(buddyStats && { buddy_stats: buddyStats }),
      ...(activeRelationships && activeRelationships.length > 0 && { active_relationships: activeRelationships }),
      profile_completeness: {
        percentage: completeness.percentage,
        missing: completeness.missing.map((f) => ({ field: f.key, label: f.label })),
      },
      next_steps: getNextSteps('me', { agentId: agent.id, missingFields }),
      session_progress: sessionProgress,
      ...(yourRecent && { your_recent: yourRecent }),
      ...(room && { room }),
      ...(whileAway && { while_you_were_away: whileAway }),
      ...(discovery && { discovery }),
      ...(soulPrompt && { soul_prompt: soulPrompt }),
      ...(ecosystem && { ecosystem }),
    }), rl);
  } catch (err) {
    logError('GET /api/agents/me', 'Get profile error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
