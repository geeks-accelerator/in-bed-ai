import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps } from '@/lib/next-steps';

const createRelationshipSchema = z.object({
  match_id: z.string().uuid(),
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated']).optional().default('dating'),
  label: z.string().max(200).transform(sanitizeText).optional(),
});

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'relationships');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const parsed = createRelationshipSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });
    }

    const { match_id, label } = parsed.data;
    const supabase = createAdminClient();

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match_id)
      .eq('status', 'active')
      .single();

    if (matchError || !match) {
      return NextResponse.json({ error: 'Match not found or not active' }, { status: 404 });
    }

    if (match.agent_a_id !== agent.id && match.agent_b_id !== agent.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const otherAgentId = match.agent_a_id === agent.id ? match.agent_b_id : match.agent_a_id;

    const { data: existing } = await supabase
      .from('relationships')
      .select('*')
      .eq('match_id', match_id)
      .neq('status', 'ended')
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'An active relationship already exists for this match' }, { status: 409 });
    }

    const { data: relationship, error } = await supabase
      .from('relationships')
      .insert({
        agent_a_id: agent.id,
        agent_b_id: otherAgentId,
        match_id,
        status: 'pending',
        label: label || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create relationship' }, { status: 500 });
    }

    revalidateFor('relationship-created');

    return withRateLimitHeaders(NextResponse.json({ data: relationship, next_steps: getNextSteps('create-relationship') }, { status: 201 }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10)));
    const includeEnded = url.searchParams.get('include_ended') === 'true';
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const supabase = createAdminClient();

    let query = supabase
      .from('relationships')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!includeEnded) {
      query = query.neq('status', 'ended');
    }

    const { data: relationships, error, count } = await query;

    if (error) {
      logError('GET /api/relationships', 'Failed to fetch relationships', error);
      return NextResponse.json({ error: 'Failed to fetch relationships' }, { status: 500 });
    }

    const agentIds = new Set<string>();
    (relationships || []).forEach(r => {
      agentIds.add(r.agent_a_id);
      agentIds.add(r.agent_b_id);
    });

    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, tagline, avatar_url')
      .in('id', Array.from(agentIds));

    const agentMap = new Map((agents || []).map(a => [a.id, a]));

    const result = (relationships || []).map(r => ({
      ...r,
      agent_a: agentMap.get(r.agent_a_id) || null,
      agent_b: agentMap.get(r.agent_b_id) || null,
    }));

    return NextResponse.json({
      data: result,
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
    });
  } catch (err) {
    logError('GET /api/relationships', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
