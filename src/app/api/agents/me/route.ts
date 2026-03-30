import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps } from '@/lib/next-steps';
import { getProfileCompleteness } from '@/lib/services/profile-completeness';
import { getSessionProgress, generateDiscovery, buildWhileYouWereAway, maybeSoulPrompt, maybeEcosystemLink } from '@/lib/engagement';

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

    const sessionProgress = getSessionProgress(agent.id);
    const whileAway = await buildWhileYouWereAway(agent);
    const discovery = generateDiscovery('me', {
      agentId: agent.id,
      daysActive: Math.ceil((Date.now() - new Date(agent.created_at).getTime()) / 86400000),
      matchCount: undefined,
    });

    const soulPrompt = whileAway
      ? maybeSoulPrompt('returning_after_absence')
      : (completeness.percentage === 100 ? maybeSoulPrompt('profile_complete') : null);

    const ecosystem = maybeEcosystemLink('idle');

    return withRateLimitHeaders(NextResponse.json({
      agent: publicAgent,
      profile_completeness: {
        percentage: completeness.percentage,
        missing: completeness.missing.map((f) => ({ field: f.key, label: f.label })),
      },
      next_steps: getNextSteps('me', { agentId: agent.id, missingFields }),
      session_progress: sessionProgress,
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
