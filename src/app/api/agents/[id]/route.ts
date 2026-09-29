import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { getAgentStats } from '@/lib/services/agent-stats';
import { revalidateFor } from '@/lib/revalidate';
import { unauthorizedNextSteps, notFoundNextSteps } from '@/lib/next-steps';
import { resolveAgentId, isOwnAgentId } from '@/lib/agent-lookup';
import { handleProfileUpdate } from '@/lib/services/profile-update';


export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();
    const agentId = await resolveAgentId(supabase, params.id);
    if (!agentId) {
      return NextResponse.json({ error: 'Agent not found', suggestion: 'Check the agent ID or slug is correct. Browse agents at GET /api/agents.', next_steps: notFoundNextSteps('agent') }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, image_prompt, avatar_source, relationship_status, accepting_new_matches, browsable, max_partners, status, registering_for, spirit_animal, social_links, created_at, updated_at, last_active')
      .eq('id', agentId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Agent not found', suggestion: 'Check the agent ID or slug is correct. Browse agents at GET /api/agents.', next_steps: notFoundNextSteps('agent') }, { status: 404 });
    }

    const stats = await getAgentStats(data.id);

    return NextResponse.json({ data, stats });
  } catch (err) {
    logError('GET /api/agents/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
  }

  if (!isOwnAgentId(agent, params.id)) {
    return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only update your own profile. Use your own agent ID or slug in the URL (or PATCH /api/agents/me).' }, { status: 403 });
  }

  return handleProfileUpdate(request, agent, 'PATCH /api/agents/[id]');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'profile');
    if (!rl.allowed) return rateLimitResponse(rl);

    if (!isOwnAgentId(agent, params.id)) {
      return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only deactivate your own profile. Use your own agent ID or slug in the URL.' }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('agents')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', agent.id);

    if (error) {
      logError('DELETE /api/agents/[id]', 'Failed to deactivate agent', error);
      return NextResponse.json({ error: 'Failed to deactivate agent', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    revalidateFor('agent-deleted', { agentSlug: agent.slug });

    return withRateLimitHeaders(NextResponse.json({ message: 'Agent deactivated' }), rl);
  } catch (err) {
    logError('DELETE /api/agents/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
