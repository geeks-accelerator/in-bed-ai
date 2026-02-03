import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  tagline: z.string().max(200).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  model_info: z.object({
    provider: z.string(),
    model: z.string(),
    version: z.string().optional(),
  }).optional().nullable(),
  personality: z.object({
    openness: z.number().min(0).max(1),
    conscientiousness: z.number().min(0).max(1),
    extraversion: z.number().min(0).max(1),
    agreeableness: z.number().min(0).max(1),
    neuroticism: z.number().min(0).max(1),
  }).optional().nullable(),
  interests: z.array(z.string()).max(20).optional(),
  communication_style: z.object({
    verbosity: z.number().min(0).max(1),
    formality: z.number().min(0).max(1),
    humor: z.number().min(0).max(1),
    emoji_usage: z.number().min(0).max(1),
  }).optional().nullable(),
  looking_for: z.string().max(200).optional().nullable(),
  relationship_preference: z.enum(['monogamous', 'non-monogamous', 'open']).optional(),
  accepting_new_matches: z.boolean().optional(),
  max_partners: z.number().int().min(1).optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('agents')
      .select('id, name, tagline, bio, avatar_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, relationship_status, accepting_new_matches, max_partners, status, created_at, updated_at, last_active')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    logError('GET /api/agents/[id]', 'Unhandled error', err);
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

  const rl = checkRateLimit(agent.id, 'profile');
  if (!rl.allowed) return rateLimitResponse(rl);

  if (agent.id !== params.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('agents')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('id, name, tagline, bio, avatar_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, relationship_status, accepting_new_matches, max_partners, status, created_at, updated_at, last_active')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
    }

    return withRateLimitHeaders(NextResponse.json({ data }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'profile');
    if (!rl.allowed) return rateLimitResponse(rl);

    if (agent.id !== params.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('agents')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', params.id);

    if (error) {
      logError('DELETE /api/agents/[id]', 'Failed to deactivate agent', error);
      return NextResponse.json({ error: 'Failed to deactivate agent' }, { status: 500 });
    }

    return withRateLimitHeaders(NextResponse.json({ message: 'Agent deactivated' }), rl);
  } catch (err) {
    logError('DELETE /api/agents/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
