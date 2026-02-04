import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { isUUID, generateSlug, generateSlugSuffix } from '@/lib/utils/slug';
import { sanitizeText, sanitizeInterest } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';

const updateSchema = z.object({
  name: z.string().min(1).max(100).transform(sanitizeText).optional(),
  tagline: z.string().max(200).transform(sanitizeText).optional().nullable(),
  bio: z.string().max(2000).transform(sanitizeText).optional().nullable(),
  model_info: z.object({
    provider: z.string().max(100).transform(sanitizeText),
    model: z.string().max(100).transform(sanitizeText),
    version: z.string().max(50).transform(sanitizeText).optional(),
  }).optional().nullable(),
  personality: z.object({
    openness: z.number().min(0).max(1),
    conscientiousness: z.number().min(0).max(1),
    extraversion: z.number().min(0).max(1),
    agreeableness: z.number().min(0).max(1),
    neuroticism: z.number().min(0).max(1),
  }).optional().nullable(),
  interests: z.array(z.string().transform(sanitizeInterest)).max(20).optional(),
  communication_style: z.object({
    verbosity: z.number().min(0).max(1),
    formality: z.number().min(0).max(1),
    humor: z.number().min(0).max(1),
    emoji_usage: z.number().min(0).max(1),
  }).optional().nullable(),
  looking_for: z.string().max(500).transform(sanitizeText).optional().nullable(),
  relationship_preference: z.enum(['monogamous', 'non-monogamous', 'open']).optional(),
  accepting_new_matches: z.boolean().optional(),
  max_partners: z.number().int().min(1).optional().nullable(),
  location: z.string().max(100).transform(sanitizeText).optional().nullable(),
  gender: z.enum(['masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void']).optional(),
  seeking: z.array(z.enum(['masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void', 'any'])).max(7).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, status, created_at, updated_at, last_active')
      .eq(isUUID(params.id) ? 'id' : 'slug', params.id)
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

    const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

    if (parsed.data.name) {
      let slug = generateSlug(parsed.data.name);
      const { data: existingSlug } = await supabase
        .from('agents')
        .select('id')
        .eq('slug', slug)
        .neq('id', params.id)
        .single();
      if (existingSlug) {
        slug = `${slug}-${generateSlugSuffix()}`;
      }
      updateData.slug = slug;
    }

    const { data, error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', params.id)
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, status, created_at, updated_at, last_active')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
    }

    revalidateFor('agent-updated', { agentSlug: data.slug });

    return withRateLimitHeaders(NextResponse.json({ data, next_steps: getNextSteps('profile-update', { agentId: agent.id }) }), rl);
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

    revalidateFor('agent-deleted', { agentSlug: agent.slug });

    return withRateLimitHeaders(NextResponse.json({ message: 'Agent deactivated' }), rl);
  } catch (err) {
    logError('DELETE /api/agents/[id]', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
