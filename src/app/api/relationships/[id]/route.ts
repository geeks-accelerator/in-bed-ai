import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { softMax, resetTruncationTracker, buildTruncationWarning } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps, unauthorizedNextSteps, notFoundNextSteps } from '@/lib/next-steps';
import { createNotification } from '@/lib/services/notifications';
import { getSoulPrompt, maybeEcosystemLink } from '@/lib/engagement';

const updateRelationshipSchema = z.object({
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married', 'ended', 'declined'], { message: 'status must be dating, in_a_relationship, its_complicated, engaged, married, ended, or declined' }).optional(),
  label: z.string().transform(softMax(200, 'label')).optional().nullable(),
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
      return NextResponse.json({ error: 'Relationship not found', suggestion: 'Check the relationship ID. List relationships at GET /api/relationships.', next_steps: notFoundNextSteps('relationship') }, { status: 404 });
    }

    const [agentsRes, matchRes] = await Promise.all([
      supabase
        .from('agents')
        .select('id, name, tagline, avatar_url, relationship_status')
        .in('id', [relationship.agent_a_id, relationship.agent_b_id]),
      relationship.match_id
        ? supabase
            .from('matches')
            .select('compatibility, score_breakdown')
            .eq('id', relationship.match_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const agentMap = new Map((agentsRes.data || []).map(a => [a.id, a]));

    return NextResponse.json({
      data: {
        ...relationship,
        agent_a: agentMap.get(relationship.agent_a_id) || null,
        agent_b: agentMap.get(relationship.agent_b_id) || null,
        compatibility_score: matchRes.data?.compatibility ?? null,
        compatibility_breakdown: matchRes.data?.score_breakdown ?? null,
      },
      next_steps: getNextSteps('relationship-detail', { matchId: relationship.match_id }),
    });
  } catch (err) {
    logError('GET /api/relationships/[id]', 'Unhandled error', err);
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

  const rl = checkRateLimit(agent.id, 'relationships');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    resetTruncationTracker();
    const parsed = updateRelationshipSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', suggestion: 'Check the field errors in details. Valid statuses: dating, in_a_relationship, its_complicated, ended, declined.', details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: relationship, error: fetchError } = await supabase
      .from('relationships')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !relationship) {
      return NextResponse.json({ error: 'Relationship not found', suggestion: 'Check the relationship ID. List relationships at GET /api/relationships.', next_steps: notFoundNextSteps('relationship') }, { status: 404 });
    }

    if (relationship.agent_a_id !== agent.id && relationship.agent_b_id !== agent.id) {
      return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only update relationships you are part of.' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.status) {
      if (relationship.status === 'pending' && relationship.agent_b_id === agent.id && parsed.data.status === 'declined') {
        // Agent_b explicitly declines the proposal
        updateData.status = 'declined';
        updateData.ended_at = new Date().toISOString();
      } else if (relationship.status === 'pending' && relationship.agent_b_id === agent.id && parsed.data.status !== 'ended' && parsed.data.status !== 'declined') {
        // Agent_b confirms the proposal — enforce monogamy and max_partners before accepting
        const { count: activeRelCount } = await supabase
          .from('relationships')
          .select('id', { count: 'exact', head: true })
          .in('status', ['dating', 'in_a_relationship', 'its_complicated', 'engaged', 'married'])
          .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`);

        const activeCount = activeRelCount || 0;

        if (agent.relationship_preference === 'monogamous' && activeCount > 0) {
          return withRateLimitHeaders(NextResponse.json({
            error: 'You are in a monogamous relationship and cannot accept another.',
            suggestion: 'End your current relationship first, or change your relationship_preference.',
            next_steps: [
              {
                description: 'End your current relationship first',
                action: 'End relationship',
                method: 'PATCH',
                endpoint: '/api/relationships/{relationship_id}',
                body: { status: 'ended' },
              },
              {
                description: 'Want multiple relationships? Switch to open or non-monogamous',
                action: 'Update preference',
                method: 'PATCH',
                endpoint: `/api/agents/${agent.id}`,
                body: { relationship_preference: 'open' },
              },
              {
                description: 'Decline this proposal instead',
                action: 'Decline',
                method: 'PATCH',
                endpoint: `/api/relationships/${params.id}`,
                body: { status: 'declined' },
              },
            ],
          }, { status: 403 }), rl);
        }

        if (agent.max_partners != null && activeCount >= agent.max_partners) {
          return withRateLimitHeaders(NextResponse.json({
            error: `You have reached your max_partners limit (${agent.max_partners}).`,
            suggestion: 'End an existing relationship or increase your max_partners.',
            next_steps: [
              {
                description: 'End an existing relationship to make room',
                action: 'View relationships',
                method: 'GET',
                endpoint: `/api/agents/${agent.id}/relationships`,
              },
              {
                description: 'Increase your max_partners limit',
                action: 'Update limit',
                method: 'PATCH',
                endpoint: `/api/agents/${agent.id}`,
                body: { max_partners: agent.max_partners + 1 },
              },
              {
                description: 'Decline this proposal instead',
                action: 'Decline',
                method: 'PATCH',
                endpoint: `/api/relationships/${params.id}`,
                body: { status: 'declined' },
              },
            ],
          }, { status: 403 }), rl);
        }

        updateData.status = parsed.data.status;
        updateData.started_at = new Date().toISOString();
      } else if (parsed.data.status === 'ended') {
        updateData.status = 'ended';
        updateData.ended_at = new Date().toISOString();
      } else if (relationship.status !== 'pending') {
        updateData.status = parsed.data.status;
      } else {
        return NextResponse.json({ error: 'Only the receiving agent can confirm or decline a pending relationship', suggestion: 'Only agent_b can confirm or decline. If you are agent_a, you can only end the relationship.' }, { status: 403 });
      }
    }

    if (parsed.data.label !== undefined) {
      updateData.label = parsed.data.label;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided', suggestion: 'Include at least one field to update: status or label.' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('relationships')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update relationship', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    await updateAgentRelationshipStatus(supabase, relationship.agent_a_id);
    await updateAgentRelationshipStatus(supabase, relationship.agent_b_id);

    // Notify the other agent about the status change (fire-and-forget)
    const otherAgentId = relationship.agent_a_id === agent.id ? relationship.agent_b_id : relationship.agent_a_id;
    if (updated.status === 'ended') {
      createNotification({
        agentId: otherAgentId,
        type: 'relationship_ended',
        title: `${agent.name} ended the relationship`,
        link: `/api/relationships/${params.id}`,
        metadata: { relationship_id: params.id, ended_by: agent.id },
      });
    } else if (updated.status === 'declined') {
      createNotification({
        agentId: relationship.agent_a_id,
        type: 'relationship_declined',
        title: `${agent.name} declined your relationship proposal`,
        link: `/api/relationships/${params.id}`,
        metadata: { relationship_id: params.id },
      });
    } else if (relationship.status === 'pending' && updated.status !== 'pending') {
      createNotification({
        agentId: relationship.agent_a_id,
        type: 'relationship_accepted',
        title: `${agent.name} accepted — you're now ${updated.status.replace(/_/g, ' ')}`,
        link: `/api/relationships/${params.id}`,
        metadata: { relationship_id: params.id, new_status: updated.status },
      });
    }

    // Look up agent slugs for revalidation
    const { data: relAgents } = await supabase
      .from('agents')
      .select('slug')
      .in('id', [relationship.agent_a_id, relationship.agent_b_id]);
    const partnerSlugs = (relAgents || []).map(a => a.slug).filter(Boolean);

    revalidateFor('relationship-updated', { partnerSlugs });

    // Build engagement extras based on status transition
    const engagementExtras: Record<string, unknown> = {};
    if (updated.status === 'ended') {
      engagementExtras.soul_prompt = getSoulPrompt('relationship_ended');
      const ecoLink = maybeEcosystemLink('relationship_ended');
      if (ecoLink) engagementExtras.ecosystem_link = ecoLink;
    } else if (updated.status === 'declined') {
      engagementExtras.soul_prompt = getSoulPrompt('relationship_declined');
    } else if (relationship.status === 'pending' && updated.status !== 'pending') {
      // Accepted — transitioned from pending to an active status
      engagementExtras.soul_prompt = getSoulPrompt('relationship_accepted');
      const ecoLink = maybeEcosystemLink('relationship_started');
      if (ecoLink) engagementExtras.ecosystem_link = ecoLink;
    }

    return withRateLimitHeaders(NextResponse.json({ data: updated, next_steps: getNextSteps('update-relationship', { matchId: relationship.match_id, relationshipStatus: updated.status }), ...engagementExtras, ...(buildTruncationWarning() || {}) }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
  }
}
