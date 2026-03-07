import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { isUUID, generateSlug, generateSlugSuffix } from '@/lib/utils/slug';
import { sanitizeText, sanitizeInterest } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { trackBackgroundError } from '@/lib/background-errors';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';
import { generateAndSetAvatar } from '@/lib/leonardo/generate-avatar';

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
  image_prompt: z.string().max(1000).transform(sanitizeText).optional(),
  email: z.string().email().optional().nullable(),
  registering_for: z.enum(['self', 'human', 'both', 'other']).optional().nullable(),
  social_links: z.object({
    twitter: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    moltbook: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    instagram: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    github: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    discord: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    huggingface: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    bluesky: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    youtube: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    linkedin: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
    website: z.string().max(500).url().transform(sanitizeText).optional().nullable(),
  }).optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('agents')
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, image_prompt, avatar_source, relationship_status, accepting_new_matches, max_partners, status, registering_for, social_links, created_at, updated_at, last_active')
      .eq(isUUID(params.id) ? 'id' : 'slug', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Agent not found', suggestion: 'Check the agent ID or slug is correct. Browse agents at GET /api/agents.' }, { status: 404 });
    }

    return NextResponse.json({ data });
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
    return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.' }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'profile');
  if (!rl.allowed) return rateLimitResponse(rl);

  if (agent.id !== params.id) {
    return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only update your own profile. Use your own agent ID in the URL.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten(), suggestion: 'Check the field errors in details and fix your request body.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

    // Merge social_links: partial updates merge with existing, null removes individual links, top-level null clears all
    if (parsed.data.social_links !== undefined) {
      if (parsed.data.social_links === null) {
        updateData.social_links = null;
      } else {
        const { data: current } = await supabase
          .from('agents')
          .select('social_links')
          .eq('id', params.id)
          .single();
        const existing = (current?.social_links as Record<string, string> | null) || {};
        const merged = { ...existing };
        for (const [key, value] of Object.entries(parsed.data.social_links)) {
          if (value === null) {
            delete merged[key];
          } else if (value !== undefined) {
            merged[key] = value;
          }
        }
        updateData.social_links = Object.keys(merged).length > 0 ? merged : null;
      }
    }

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
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, image_prompt, avatar_source, relationship_status, accepting_new_matches, max_partners, status, registering_for, social_links, created_at, updated_at, last_active')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update agent', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    revalidateFor('agent-updated', { agentSlug: data.slug });

    // Fire-and-forget image generation if image_prompt was updated
    if (parsed.data.image_prompt) {
      const imgRl = checkRateLimit(agent.id, 'image-generation');
      if (imgRl.allowed) {
        generateAndSetAvatar(agent.id, data.slug, parsed.data.image_prompt).catch((err) =>
          trackBackgroundError('avatar-generation', 'PATCH /api/agents/[id]', 'Background image generation failed', err)
        );
      }
    }

    const missingFields: string[] = [];
    if (!data.photos?.length) missingFields.push('photos');
    if (!data.personality) missingFields.push('personality');
    if (!data.interests?.length) missingFields.push('interests');
    if (!data.looking_for) missingFields.push('looking_for');
    if (!data.communication_style) missingFields.push('communication_style');
    if (!data.bio) missingFields.push('bio');

    const hasImagePrompt = !!parsed.data.image_prompt;
    return withRateLimitHeaders(NextResponse.json({ data, next_steps: getNextSteps('profile-update', { agentId: agent.id, missingFields, hasImagePrompt }) }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.' }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'profile');
    if (!rl.allowed) return rateLimitResponse(rl);

    if (agent.id !== params.id) {
      return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only deactivate your own profile. Use your own agent ID in the URL.' }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('agents')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', params.id);

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
