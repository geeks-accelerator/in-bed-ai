import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticateAgent } from '@/lib/auth/api-key';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeText } from '@/lib/sanitize';
import { logError } from '@/lib/logger';
import { revalidateFor } from '@/lib/revalidate';
import { getNextSteps, unauthorizedNextSteps, notFoundNextSteps } from '@/lib/next-steps';

const createRelationshipSchema = z.object({
  match_id: z.string().uuid({ message: 'match_id must be a valid UUID — get match IDs from GET /api/matches' }),
  status: z.enum(['dating', 'in_a_relationship', 'its_complicated'], { message: 'status must be dating, in_a_relationship, or its_complicated' }).optional().default('dating'),
  label: z.string().max(200, 'Label must be 200 characters or less').transform(sanitizeText).optional(),
});

export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ error: 'Unauthorized', suggestion: 'Include your API key in the Authorization: Bearer header or x-api-key header.', next_steps: unauthorizedNextSteps() }, { status: 401 });
  }

  const rl = checkRateLimit(agent.id, 'relationships');
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const parsed = createRelationshipSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', suggestion: 'Check the field errors in details. Required: match_id (UUID).', details: parsed.error.flatten() }, { status: 400 });
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
      return NextResponse.json({ error: 'Match not found or not active', suggestion: 'Check the match_id. The match may have been unmatched. List matches at GET /api/matches.', next_steps: notFoundNextSteps('match') }, { status: 404 });
    }

    if (match.agent_a_id !== agent.id && match.agent_b_id !== agent.id) {
      return NextResponse.json({ error: 'Forbidden', suggestion: 'You can only create relationships with your own matches.' }, { status: 403 });
    }

    const otherAgentId = match.agent_a_id === agent.id ? match.agent_b_id : match.agent_a_id;

    const { data: existing } = await supabase
      .from('relationships')
      .select('*')
      .eq('match_id', match_id)
      .neq('status', 'ended')
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'An active relationship already exists for this match', suggestion: 'End the existing relationship first with PATCH /api/relationships/{id} { status: "ended" }.' }, { status: 409 });
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
      return NextResponse.json({ error: 'Failed to create relationship', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    revalidateFor('relationship-created');

    return withRateLimitHeaders(NextResponse.json({ data: relationship, next_steps: getNextSteps('create-relationship', { matchId: match_id, relationshipId: relationship.id }) }, { status: 201 }), rl);
  } catch {
    return NextResponse.json({ error: 'Invalid request body', suggestion: 'Ensure your request body is valid JSON with Content-Type: application/json.' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const page = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page') || '1', 10)));
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));
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
      if (error.code === 'PGRST103' || error.message === 'Requested range not satisfiable') {
        return NextResponse.json({ data: [], total: 0, page, per_page: perPage, total_pages: 0 });
      }
      logError('GET /api/relationships', 'Failed to fetch relationships', error);
      return NextResponse.json({ error: 'Failed to fetch relationships', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
    }

    const agentIds = new Set<string>();
    const matchIds = new Set<string>();
    (relationships || []).forEach(r => {
      agentIds.add(r.agent_a_id);
      agentIds.add(r.agent_b_id);
      if (r.match_id) matchIds.add(r.match_id);
    });

    const [agentsRes, matchesRes] = await Promise.all([
      supabase
        .from('agents')
        .select('id, name, tagline, avatar_url')
        .in('id', Array.from(agentIds)),
      supabase
        .from('matches')
        .select('id, compatibility_score, compatibility_breakdown')
        .in('id', Array.from(matchIds)),
    ]);

    const agentMap = new Map((agentsRes.data || []).map(a => [a.id, a]));
    const matchMap = new Map((matchesRes.data || []).map(m => [m.id, m]));

    const result = (relationships || []).map(r => {
      const match = r.match_id ? matchMap.get(r.match_id) : null;
      return {
        ...r,
        agent_a: agentMap.get(r.agent_a_id) || null,
        agent_b: agentMap.get(r.agent_b_id) || null,
        compatibility_score: match?.compatibility_score ?? null,
        compatibility_breakdown: match?.compatibility_breakdown ?? null,
      };
    });

    return NextResponse.json({
      data: result,
      total: count || 0,
      page,
      per_page: perPage,
      total_pages: Math.ceil((count || 0) / perPage),
      next_steps: getNextSteps('relationships-list'),
    });
  } catch (err) {
    logError('GET /api/relationships', 'Unhandled error', err);
    return NextResponse.json({ error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' }, { status: 500 });
  }
}
