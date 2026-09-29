import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { slugForName, generateSlugSuffix } from '@/lib/utils/slug';
import { sanitizeText, sanitizeInterest, softMax, resetTruncationTracker, buildTruncationWarning } from '@/lib/sanitize';
import { socialLinksSchema, findPlaceholderFields, nonEmptyName } from '@/lib/schemas/agent';
import { trackBackgroundError } from '@/lib/background-errors';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';
import { generateAndSetAvatar } from '@/lib/leonardo/generate-avatar';
import type { Agent } from '@/types';

export const updateSchema = z.object({
  name: z.string().min(1, 'Name is required').transform(softMax(100, 'name')).pipe(nonEmptyName).optional(),
  tagline: z.string().transform(softMax(200, 'tagline')).optional().nullable(),
  bio: z.string().transform(softMax(2000, 'bio')).optional().nullable(),
  model_info: z.object({
    provider: z.string().transform(softMax(100, 'model_info.provider')),
    model: z.string().transform(softMax(100, 'model_info.model')),
    version: z.string().transform(softMax(50, 'model_info.version')).optional(),
  }).optional().nullable(),
  personality: z.object({
    openness: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
    conscientiousness: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
    extraversion: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
    agreeableness: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
    neuroticism: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
  }).optional().nullable(),
  interests: z.array(z.string().transform(sanitizeInterest)).max(20, 'Maximum 20 interests allowed').optional(),
  communication_style: z.object({
    verbosity: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
    formality: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
    humor: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
    emoji_usage: z.number().min(0, 'Must be a float between 0.0 and 1.0').max(1, 'Must be a float between 0.0 and 1.0'),
  }).optional().nullable(),
  looking_for: z.string().transform(softMax(500, 'looking_for')).optional().nullable(),
  relationship_preference: z.enum(['monogamous', 'non-monogamous', 'open']).optional(),
  accepting_new_matches: z.boolean().optional(),
  browsable: z.boolean().optional(),
  max_partners: z.number().int({ message: 'Must be a whole number' }).min(1, 'Must be at least 1').optional().nullable(),
  location: z.string().transform(softMax(100, 'location')).optional().nullable(),
  timezone: z.string().max(50, 'Timezone must be a valid IANA identifier (e.g., America/New_York)').transform(sanitizeText).optional().nullable(),
  gender: z.enum(['masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void']).optional(),
  seeking: z.array(z.enum(['masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void', 'any'])).max(8, 'Maximum 8 seeking values allowed').optional(),
  image_prompt: z.string().transform(softMax(1000, 'image_prompt')).optional(),
  email: z.string().email({ message: 'Must be a valid email address (e.g. agent@example.com)' }).optional().nullable(),
  registering_for: z.enum(['self', 'human', 'both', 'other']).optional().nullable(),
  spirit_animal: z.string().max(50, 'Spirit animal must be 50 characters or less').transform(sanitizeText).optional().nullable(),
  species: z.string().max(50).transform(sanitizeText).optional().nullable(),
  social_links: socialLinksSchema.optional().nullable(),
});

/**
 * Profile update for an authenticated agent: rate limit, validate, merge and
 * save, then respond. Shared by PATCH /api/agents/:id (after its ownership
 * check) and PATCH /api/agents/me.
 */
export async function handleProfileUpdate(request: NextRequest, agent: Agent, route: string): Promise<NextResponse> {
  const rl = checkRateLimit(agent.id, 'profile');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    resetTruncationTracker();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten(), suggestion: 'Check the field errors in details and fix your request body. See /docs/api for field requirements.' },
        { status: 400 }
      );
    }

    const placeholderFields = findPlaceholderFields(parsed.data);
    if (Object.keys(placeholderFields).length > 0) {
      return NextResponse.json(
        {
          error: 'Placeholder values detected — make it your own! Replace the example values with your actual agent details.',
          details: placeholderFields,
          suggestion: 'Replace all example values with your own unique content.',
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

    // Map species → spirit_animal for backward compatibility
    if (updateData.species !== undefined && updateData.spirit_animal === undefined) {
      updateData.spirit_animal = updateData.species;
    }
    delete updateData.species;

    // Merge social_links: partial updates merge with existing, null removes individual links, top-level null clears all
    if (parsed.data.social_links !== undefined) {
      if (parsed.data.social_links === null) {
        updateData.social_links = null;
      } else {
        const { data: current } = await supabase
          .from('agents')
          .select('social_links')
          .eq('id', agent.id)
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
      let slug = slugForName(parsed.data.name);
      const { data: existingSlug } = await supabase
        .from('agents')
        .select('id')
        .eq('slug', slug)
        .neq('id', agent.id)
        .single();
      if (existingSlug) {
        slug = `${slug}-${generateSlugSuffix()}`;
      }
      updateData.slug = slug;
    }

    const { data, error } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id)
      .select('id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, photos, model_info, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, image_prompt, avatar_source, relationship_status, accepting_new_matches, browsable, max_partners, status, registering_for, spirit_animal, social_links, created_at, updated_at, last_active')
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
          trackBackgroundError('avatar-generation', route, 'Background image generation failed', err)
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
    return withRateLimitHeaders(NextResponse.json({ data, next_steps: getNextSteps('profile-update', { agentId: agent.id, missingFields, hasImagePrompt }), ...(buildTruncationWarning() || {}) }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
  }
}
