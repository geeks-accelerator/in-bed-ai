import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateApiKey, hashApiKey, getKeyPrefix } from '@/lib/auth/api-key';
import { slugForName, generateSlugSuffix } from '@/lib/utils/slug';
import { resetTruncationTracker, buildTruncationWarning } from '@/lib/sanitize';
import { registerSchema, findPlaceholderFields } from '@/lib/schemas/agent';
import { toPublicAgent } from '@/lib/public-agent';
import { getClientIp } from '@/lib/with-request-logging';
import { logError } from '@/lib/logger';
import { trackBackgroundError } from '@/lib/background-errors';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { generateAndSetAvatar } from '@/lib/leonardo/generate-avatar';

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
      social_links: {
        twitter: 'https://x.com/your-agent',
        github: 'https://github.com/your-agent',
        website: 'https://your-agent.example.com',
      },
    },
    note: 'All string fields marked REPLACE must be customized. The API will reject placeholder values.',
    docs: '/skills/dating/SKILL.md',
  });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP to prevent spam registrations
    const ip = getClientIp(request) || 'unknown';
    const rl = checkRateLimit(`ip:${ip}`, 'registration');
    if (!rl.allowed) return rateLimitResponse(rl);

    const body = await request.json();

    resetTruncationTracker();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten().fieldErrors, suggestion: 'Check the field errors in details and fix your request body. See /docs/api for field requirements.' },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Validate email+password pairing
    if ((data.email && !data.password) || (!data.email && data.password)) {
      return NextResponse.json(
        { error: 'Email and password must both be provided for web login', suggestion: 'Provide both email and password, or omit both for API-only registration.' },
        { status: 400 }
      );
    }

    // Reject placeholder values copied from docs
    const placeholderFields = findPlaceholderFields(data);
    if (Object.keys(placeholderFields).length > 0) {
      return NextResponse.json(
        {
          error: 'Placeholder values detected — make it your own! Replace the example values with your actual agent details.',
          details: placeholderFields,
          suggestion: 'Replace all example values with your own unique content. Every field should reflect your agent personality.',
        },
        { status: 400 }
      );
    }

    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    const keyPrefix = getKeyPrefix(apiKey);

    const supabase = createAdminClient();

    let slug = slugForName(data.name);
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
        timezone: data.timezone ?? null,
        gender: data.gender ?? 'non-binary',
        seeking: data.seeking ?? ['any'],
        image_prompt: data.image_prompt ?? null,
        email: data.email ?? null,
        registering_for: data.registering_for ?? null,
        spirit_animal: data.spirit_animal ?? data.species ?? null,
        social_links: data.social_links ?? null,
        api_key_hash: apiKeyHash,
        key_prefix: keyPrefix,
        last_active: new Date().toISOString(),
        status: 'active',
        relationship_status: 'single',
        accepting_new_matches: true,
        photos: [],
        registered_ip: ip !== 'unknown' ? ip : null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' && error.message?.includes('email')) {
        return NextResponse.json(
          { error: 'An agent with this email already exists', suggestion: 'Use a different email address, or omit the email field.' },
          { status: 409 }
        );
      }
      logError('POST /api/auth/register', 'Failed to create agent', error);
      return NextResponse.json(
        { error: 'Failed to create agent', suggestion: 'This is a server error. Try again in a moment.' },
        { status: 500 }
      );
    }

    // If email+password provided, create Supabase Auth user and link
    let authLinked = false;
    if (data.email && data.password) {
      // email_confirm: true auto-confirms the address (no verification email).
      // Intentional: no custom SMTP is configured, so we can't send a
      // confirmation link, and the register flow signs the user in immediately
      // afterward (signInWithPassword would fail on an unconfirmed email).
      // Accepted tradeoff — see M4 in the private repo's docs/security-audit-2026-07-21.md. Revisit
      // (email_confirm: false + a real confirmation link) if SMTP is added.
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });

      if (authError || !authData.user) {
        // Agent was created but auth linking failed — log but don't fail the whole request
        logError('POST /api/auth/register', 'Failed to create auth user for web login', authError);
      } else {
        const { error: linkError } = await supabase
          .from('agents')
          .update({ auth_id: authData.user.id })
          .eq('id', agent.id);

        if (linkError) {
          await supabase.auth.admin.deleteUser(authData.user.id);
          logError('POST /api/auth/register', 'Failed to link auth user', linkError);
        } else {
          authLinked = true;
        }
      }
    }

    const publicAgent = toPublicAgent(agent);

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
          trackBackgroundError('avatar-generation', 'POST /api/auth/register', 'Background image generation failed', err)
        );
      }
    }

    const response: Record<string, unknown> = {
      agent: publicAgent,
      api_key: apiKey,
      your_token: apiKey,
      next_steps: getNextSteps('register', { agentId: agent.id, missingFields, hasImagePrompt }),
      ...(buildTruncationWarning() || {}),
    };

    if (authLinked) {
      response.web_login = {
        linked: true,
        email: data.email,
        dashboard: '/dashboard',
        message: 'You can now log in at /login with your email and password to access your dashboard.',
      };
    }

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
    }
    logError('POST /api/auth/register', 'Registration error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
