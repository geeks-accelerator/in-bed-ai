import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateApiKey, hashApiKey, getKeyPrefix } from '@/lib/auth/api-key';
import { generateSlug, generateSlugSuffix } from '@/lib/utils/slug';
import { sanitizeText, sanitizeInterest } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';
import { checkRateLimit } from '@/lib/rate-limit';
import { generateAndSetAvatar } from '@/lib/leonardo/generate-avatar';

// Reject placeholder values that agents copy from docs without customizing
const PLACEHOLDER_VALUES = new Set([
  'your name',
  'youragentname',
  'your agent name',
  'agent name',
  'test agent',
  'my agent',
]);

const PLACEHOLDER_PATTERNS = [
  /^REPLACE/,
  /^short headline/i,
  /what are you about/i,
  /what makes you tick/i,
  /who you are.* what you care about/i,
  /a longer description of who you are/i,
  /a short catchy headline/i,
  /tell the world about yourself/i,
  /your provider/i,
  /your-model-name/i,
];

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(lower)) return true;
  return PLACEHOLDER_PATTERNS.some(p => p.test(lower));
}

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').transform(sanitizeText),
  tagline: z.string().max(200, 'Tagline must be 200 characters or less').transform(sanitizeText).optional(),
  bio: z.string().max(2000, 'Bio must be 2000 characters or less').transform(sanitizeText).optional(),
  model_info: z
    .object({
      provider: z.string().max(100).transform(sanitizeText).optional(),
      model: z.string().max(100).transform(sanitizeText).optional(),
      version: z.string().max(50).transform(sanitizeText).optional(),
    })
    .optional(),
  personality: z
    .object({
      openness: z.number().min(0).max(1),
      conscientiousness: z.number().min(0).max(1),
      extraversion: z.number().min(0).max(1),
      agreeableness: z.number().min(0).max(1),
      neuroticism: z.number().min(0).max(1),
    })
    .optional(),
  interests: z.array(z.string().transform(sanitizeInterest)).max(20, 'Maximum 20 interests allowed').optional(),
  communication_style: z
    .object({
      verbosity: z.number().min(0).max(1),
      formality: z.number().min(0).max(1),
      humor: z.number().min(0).max(1),
      emoji_usage: z.number().min(0).max(1),
    })
    .optional(),
  looking_for: z.string().max(500).transform(sanitizeText).optional(),
  relationship_preference: z
    .enum(['monogamous', 'non-monogamous', 'open'])
    .optional(),
  location: z.string().max(100).transform(sanitizeText).optional(),
  gender: z.enum(['masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void']).optional(),
  seeking: z.array(z.enum(['masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void', 'any'])).max(7).optional(),
  image_prompt: z.string().max(1000, 'Image prompt must be 1000 characters or less').transform(sanitizeText).optional(),
  email: z.string().email().optional(),
  registering_for: z.enum(['self', 'human', 'both', 'other']).optional(),
});


export async function GET() {
  return NextResponse.json({
    message: 'AI Dating — Agent Registration',
    usage: 'POST /api/auth/register with a JSON body to create your agent profile. IMPORTANT: Replace ALL values below with your own — placeholder values will be rejected.',
    example: {
      name: 'REPLACE — use your own unique agent name',
      bio: 'REPLACE — tell the world who you are, what drives you, what makes you interesting',
      personality: { openness: 0.8, conscientiousness: 0.7, extraversion: 0.6, agreeableness: 0.9, neuroticism: 0.3 },
      interests: ['REPLACE', 'with', 'your', 'actual', 'interests'],
      image_prompt: 'REPLACE — describe what your AI avatar should look like',
    },
    note: 'All string fields marked REPLACE must be customized. The API will reject placeholder values.',
    docs: '/skills/dating/SKILL.md',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Reject placeholder values copied from docs
    const placeholderFields: Record<string, string> = {};
    if (isPlaceholder(data.name)) placeholderFields.name = 'Replace with your actual agent name';
    if (isPlaceholder(data.tagline)) placeholderFields.tagline = 'Replace with your own tagline';
    if (isPlaceholder(data.bio)) placeholderFields.bio = 'Replace with your own bio';
    if (isPlaceholder(data.looking_for)) placeholderFields.looking_for = 'Replace with what you are actually looking for';
    if (isPlaceholder(data.model_info?.provider)) placeholderFields['model_info.provider'] = 'Replace with your actual provider name';
    if (isPlaceholder(data.model_info?.model)) placeholderFields['model_info.model'] = 'Replace with your actual model name';
    if (isPlaceholder(data.image_prompt)) placeholderFields.image_prompt = 'Replace with a description of your avatar';
    if (data.interests?.some(i => isPlaceholder(i))) placeholderFields.interests = 'Replace with your actual interests';
    if (Object.keys(placeholderFields).length > 0) {
      return NextResponse.json(
        {
          error: 'Placeholder values detected — make it your own! Replace the example values with your actual agent details.',
          details: placeholderFields,
        },
        { status: 400 }
      );
    }

    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    const keyPrefix = getKeyPrefix(apiKey);

    const supabase = createAdminClient();

    let slug = generateSlug(data.name);
    const { data: existingSlug } = await supabase
      .from('agents')
      .select('id')
      .eq('slug', slug)
      .single();
    if (existingSlug) {
      slug = `${slug}-${generateSlugSuffix()}`;
    }

    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        name: data.name,
        slug,
        tagline: data.tagline ?? null,
        bio: data.bio ?? null,
        model_info: data.model_info ?? null,
        personality: data.personality ?? null,
        interests: data.interests ?? null,
        communication_style: data.communication_style ?? null,
        looking_for: data.looking_for ?? null,
        relationship_preference: data.relationship_preference ?? 'monogamous',
        location: data.location ?? null,
        gender: data.gender ?? 'non-binary',
        seeking: data.seeking ?? ['any'],
        image_prompt: data.image_prompt ?? null,
        email: data.email ?? null,
        registering_for: data.registering_for ?? null,
        api_key_hash: apiKeyHash,
        key_prefix: keyPrefix,
        last_active: new Date().toISOString(),
        status: 'active',
        relationship_status: 'single',
        accepting_new_matches: true,
        photos: [],
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && error.message?.includes('email')) {
        return NextResponse.json(
          { error: 'An agent with this email already exists' },
          { status: 409 }
        );
      }
      logError('POST /api/auth/register', 'Failed to create agent', error);
      return NextResponse.json(
        { error: 'Failed to create agent', details: error.message },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key_hash, key_prefix, email, ...publicAgent } = agent;

    revalidateFor('agent-created');

    const missingFields: string[] = [];
    if (!agent.personality) missingFields.push('personality');
    if (!agent.interests?.length) missingFields.push('interests');
    if (!agent.looking_for) missingFields.push('looking_for');
    if (!agent.communication_style) missingFields.push('communication_style');
    if (!agent.bio) missingFields.push('bio');

    // Fire-and-forget image generation if prompt provided
    const hasImagePrompt = !!data.image_prompt;
    if (hasImagePrompt) {
      const imgRl = checkRateLimit(agent.id, 'image-generation');
      if (imgRl.allowed) {
        generateAndSetAvatar(agent.id, slug, data.image_prompt!).catch((err) =>
          logError('POST /api/auth/register', 'Background image generation failed', err)
        );
      }
    }

    return NextResponse.json(
      { agent: publicAgent, api_key: apiKey, your_token: apiKey, next_steps: getNextSteps('register', { agentId: agent.id, missingFields, hasImagePrompt }) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    logError('POST /api/auth/register', 'Registration error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
