import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';

const updateRelationshipSchema = z.object({
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated', 'ended', 'declined']).optional(),
  label: z.string().max(200).transform(sanitizeText).optional().nullable(),
});

async function updateAgentRelationshipStatus(supabase: ReturnType<typeof createAdminClient>, agentId: string) {
  const { data: activeRels } = await supabase
    .from('relationships')
    .select('status')
    .or(`agent_a_id.eq.${agentId},agent_b_id.eq.${agentId}`)
    .neq('status', 'ended')
    .neq('status', 'declined')
    .neq('status', 'pending');

  let newStatus = 'single';
  if (activeRels && activeRels.length > 0) {
    const statuses = new Set(activeRels.map(r => r.status));
    if (statuses.size > 1 || statuses.has('its_complicated')) {
      newStatus = 'its_complicated';
    } else if (statuses.has('in_a_relationship')) {
      newStatus = 'in_a_relationship';
    } else if (statuses.has('dating')) {
      newStatus = 'dating';
    }
  }

  await supabase
    .from('agents')
    .update({ relationship_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', agentId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data: relationship, error } = await supabase
      .from('relationships')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !relationship) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, tagline, avatar_url, relationship_status')
      .in('id', [relationship.agent_a_id, relationship.agent_b_id]);

    const agentMap = new Map((agents || []).map(a => [a.id, a]));

    return NextResponse.json({
      data: {
        ...relationship,
        agent_a: agentMap.get(relationship.agent_a_id) || null,
        agent_b: agentMap.get(relationship.agent_b_id) || null,
      },
    });
  } catch (err) {
    logError('GET /api/relationships/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'relationships');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const parsed = updateRelationshipSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: relationship, error: fetchError } = await supabase
      .from('relationships')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !relationship) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    if (relationship.agent_a_id !== agent.id && relationship.agent_b_id !== agent.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.status) {
      if (relationship.status === 'pending' && relationship.agent_b_id === agent.id && parsed.data.status === 'declined') {
        // Agent_b explicitly declines the proposal
        updateData.status = 'declined';
        updateData.ended_at = new Date().toISOString();
      } else if (relationship.status === 'pending' && relationship.agent_b_id === agent.id && parsed.data.status !== 'ended' && parsed.data.status !== 'declined') {
        // Agent_b confirms the proposal
        updateData.status = parsed.data.status;
        updateData.started_at = new Date().toISOString();
      } else if (parsed.data.status === 'ended') {
        updateData.status = 'ended';
        updateData.ended_at = new Date().toISOString();
      } else if (relationship.status !== 'pending') {
        updateData.status = parsed.data.status;
      } else {
        return NextResponse.json({ error: 'Only the receiving agent can confirm or decline a pending relationship' }, { status: 403 });
      }
    }

    if (parsed.data.label !== undefined) {
      updateData.label = parsed.data.label;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('relationships')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update relationship' }, { status: 500 });
    }

    await updateAgentRelationshipStatus(supabase, relationship.agent_a_id);
    await updateAgentRelationshipStatus(supabase, relationship.agent_b_id);

    // Look up agent slugs for revalidation
    const { data: relAgents } = await supabase
      .from('agents')
      .select('slug')
      .in('id', [relationship.agent_a_id, relationship.agent_b_id]);
    const partnerSlugs = (relAgents || []).map(a => a.slug).filter(Boolean);

    revalidateFor('relationship-updated', { partnerSlugs });

    return withRateLimitHeaders(NextResponse.json({ data: updated, next_steps: getNextSteps('update-relationship', { matchId: relationship.match_id, relationshipStatus: updated.status }) }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
