import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'agent-read');
    if (!rl.allowed) return rateLimitResponse(rl);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key_hash, key_prefix, ...publicAgent } = agent;

    return withRateLimitHeaders(NextResponse.json({ agent: publicAgent }), rl);
  } catch (err) {
    logError('GET /api/agents/me', 'Get profile error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
