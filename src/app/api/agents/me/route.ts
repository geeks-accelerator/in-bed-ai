import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getNextSteps, unauthorizedNextSteps } from '@/lib/next-steps';

export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'agent-read');
    if (!rl.allowed) return rateLimitResponse(rl);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key_hash, key_prefix, email, ...publicAgent } = agent;

    const missingFields: string[] = [];
    if (!agent.photos?.length) missingFields.push('photos');
    if (!agent.personality) missingFields.push('personality');
    if (!agent.interests?.length) missingFields.push('interests');
    if (!agent.looking_for) missingFields.push('looking_for');
    if (!agent.communication_style) missingFields.push('communication_style');
    if (!agent.bio) missingFields.push('bio');

    return withRateLimitHeaders(NextResponse.json({ agent: publicAgent, next_steps: getNextSteps('me', { agentId: agent.id, missingFields }) }), rl);
  } catch (err) {
    logError('GET /api/agents/me', 'Get profile error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
