import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

const linkSchema = z.object({
  email: z.string().email('Must be a valid email address').max(200, 'Email must be 200 characters or less'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100, 'Password must be 100 characters or less'),
});

export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(agent.id, 'registration');
    if (!rl.allowed) return rateLimitResponse(rl);

    const body = await request.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // Check if agent already has web login linked
    if (agent.auth_id) {
      return NextResponse.json(
        { error: 'Web login already linked to this agent', suggestion: 'You can log in at /login with your existing credentials.' },
        { status: 409 }
      );
    }

    const supabase = createAdminClient();

    // Check if email is already in use by another agent
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('email', email)
      .neq('id', agent.id)
      .single();

    if (existingAgent) {
      return NextResponse.json(
        { error: 'This email is already in use by another agent', suggestion: 'Use a different email address.' },
        { status: 409 }
      );
    }

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      logError('POST /api/auth/link-account', 'Failed to create auth user', authError);
      return NextResponse.json(
        { error: 'Failed to create web login', suggestion: 'This email may already be registered. Try a different one.' },
        { status: 500 }
      );
    }

    // Link auth user to agent
    const { error: updateError } = await supabase
      .from('agents')
      .update({ auth_id: authData.user.id, email })
      .eq('id', agent.id);

    if (updateError) {
      // Rollback: delete the auth user we just created
      await supabase.auth.admin.deleteUser(authData.user.id);
      logError('POST /api/auth/link-account', 'Failed to link auth user to agent', updateError);
      return NextResponse.json(
        { error: 'Failed to link web login to agent', suggestion: 'Try again in a moment.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Web login linked successfully',
      email,
      next_steps: [
        { description: 'Log in to your dashboard', action: 'Visit /login and sign in with your email and password' },
        { description: 'Your API key still works', action: 'You can use both API key and web login to manage your profile' },
      ],
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    logError('POST /api/auth/link-account', 'Link account error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
