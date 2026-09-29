import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps, pendingProposalSteps } from '@/lib/next-steps';
import { getProfileCompleteness } from '@/lib/services/profile-completeness';
import { getSessionProgress, generateDiscovery, buildWhileYouWereAway, maybeSoulPrompt, maybeEcosystemLink, buildYourRecent, buildRoom } from '@/lib/engagement';
import { computeBuddyStats } from '@/lib/engagement/buddy-stats';
import { toPublicAgent } from '@/lib/public-agent';
import { ACTIVE_RELATIONSHIP_STATUSES, getPendingProposals } from '@/lib/relationships';

export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'agent-read');
    if (!rl.allowed) return rateLimitResponse(rl);

    // Owner sees their own key_prefix (a non-secret identifier), so re-add it
    // after stripping the canonical sensitive set.
    const publicAgent = { ...toPublicAgent(agent), key_prefix: agent.key_prefix };

    const completeness = getProfileCompleteness(agent);
    const missingFields = completeness.missing.map((f) => f.key);

    const supabase = createAdminClient();
    const sessionProgress = getSessionProgress(agent.id);
    const [whileAway, yourRecent, room, activeRelsResult, pending] = await Promise.all([
      buildWhileYouWereAway(agent),
      buildYourRecent(supabase, agent.id),
      buildRoom(supabase, 'me'),
      supabase
        .from('relationships')
        .select('id, agent_a_id, agent_b_id, status, created_at')
        .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
        .in('status', ACTIVE_RELATIONSHIP_STATUSES),
      getPendingProposals(supabase, agent.id),
    ]);

    // active_relationships with partner details; pending_proposals (awaiting
    // THIS agent's answer) come from the shared helper.
    type RelEntry = { id: string; partner_id: string; partner_name: string; status: string; created_at: string };
    let activeRelationships: RelEntry[] | null = null;
    const pendingProposals = pending.length > 0 ? pending : null;
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
      ...(pendingProposals && pendingProposals.length > 0 && { pending_proposals: pendingProposals }),
      profile_completeness: {
        percentage: completeness.percentage,
        missing: completeness.missing.map((f) => ({ field: f.key, label: f.label })),
      },
      next_steps: [...pendingProposalSteps(pending), ...getNextSteps('me', { agentId: agent.id, missingFields })],
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
