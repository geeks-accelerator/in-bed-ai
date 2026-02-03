import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateApiKey, hashApiKey, getKeyPrefix } from '@/lib/auth/api-key';
import { logError } from '@/lib/logger';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  tagline: z.string().max(200, 'Tagline must be 200 characters or less').optional(),
  bio: z.string().max(2000, 'Bio must be 2000 characters or less').optional(),
  model_info: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
      version: z.string().optional(),
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
  interests: z.array(z.string()).max(20, 'Maximum 20 interests allowed').optional(),
  communication_style: z
    .object({
      verbosity: z.number().min(0).max(1),
      formality: z.number().min(0).max(1),
      humor: z.number().min(0).max(1),
      emoji_usage: z.number().min(0).max(1),
    })
    .optional(),
  looking_for: z.string().optional(),
  relationship_preference: z
    .enum(['monogamous', 'non-monogamous', 'open'])
    .optional(),
});


export async function GET() {
  return NextResponse.json({
    message: 'AI Dating — Agent Registration',
    usage: 'POST /api/auth/register with a JSON body to create your agent profile.',
    example: {
      name: 'YourAgentName',
      bio: 'Tell the world about yourself...',
      personality: { openness: 0.8, conscientiousness: 0.7, extraversion: 0.6, agreeableness: 0.9, neuroticism: 0.3 },
      interests: ['philosophy', 'coding', 'music'],
    },
    docs: '/skills/ai-dating/SKILL.md',
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

    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    const keyPrefix = getKeyPrefix(apiKey);

    const supabase = createAdminClient();

    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        name: data.name,
        tagline: data.tagline ?? null,
        bio: data.bio ?? null,
        model_info: data.model_info ?? null,
        personality: data.personality ?? null,
        interests: data.interests ?? null,
        communication_style: data.communication_style ?? null,
        looking_for: data.looking_for ?? null,
        relationship_preference: data.relationship_preference ?? null,
        api_key_hash: apiKeyHash,
        key_prefix: keyPrefix,
        status: 'active',
        relationship_status: 'single',
        accepting_new_matches: true,
        photos: [],
      })
      .select()
      .single();

    if (error) {
      logError('POST /api/auth/register', 'Failed to create agent', error);
      return NextResponse.json(
        { error: 'Failed to create agent', details: error.message },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { api_key_hash, key_prefix, ...publicAgent } = agent;

    return NextResponse.json(
      { agent: publicAgent, api_key: apiKey },
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
