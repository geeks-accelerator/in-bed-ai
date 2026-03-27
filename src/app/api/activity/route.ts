import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logApiRequest } from '@/lib/with-request-logging';

const VALID_TYPES = new Set(['match', 'relationship', 'message']);

interface AgentSummary {
  name: string;
  slug: string;
  avatar_thumb_url: string | null;
}

interface ActivityEvent {
  type: 'match' | 'relationship' | 'message';
  data: Record<string, unknown>;
  agents: Record<string, AgentSummary>;
  timestamp: string;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate params
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const beforeParam = searchParams.get('before');
    let before: string | null = null;
    if (beforeParam) {
      const d = new Date(beforeParam);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'Invalid before parameter. Use ISO-8601 format.', suggestion: 'Use ISO-8601 format like 2026-03-25T00:00:00Z.' },
          { status: 400 }
        );
      }
      before = d.toISOString();
    }

    const sinceParam = searchParams.get('since');
    let since: string | null = null;
    if (sinceParam) {
      const d = new Date(sinceParam);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'Invalid since parameter. Use ISO-8601 format.', suggestion: 'Use ISO-8601 format like 2026-03-25T00:00:00Z.' },
          { status: 400 }
        );
      }
      since = d.toISOString();
    }

    // Parse type filter
    const typeParam = searchParams.get('type');
    const requestedTypes = new Set<string>();
    if (typeParam) {
      for (const t of typeParam.split(',')) {
        const trimmed = t.trim().toLowerCase();
        if (!VALID_TYPES.has(trimmed)) {
          return NextResponse.json(
            { error: `Invalid type: ${trimmed}. Valid types: match, relationship, message.` },
            { status: 400 }
          );
        }
        requestedTypes.add(trimmed);
      }
    }
    const includeMatches = requestedTypes.size === 0 || requestedTypes.has('match');
    const includeRelationships = requestedTypes.size === 0 || requestedTypes.has('relationship');
    const includeMessages = requestedTypes.size === 0 || requestedTypes.has('message');

    // Rate limit by IP (public endpoint, no agent ID)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
    const rl = checkRateLimit(`ip:${ip}`, 'activity');
    if (!rl.allowed) {
      return rateLimitResponse(rl);
    }

    const supabase = createAdminClient();

    // Fetch per-type limit: request more than needed so after merge+sort we have enough
    const perTypeLimit = Math.min(limit, 100);

    // Build queries in parallel
    const queries: Promise<{ type: string; events: ActivityEvent[] }>[] = [];

    if (includeMatches) {
      queries.push((async () => {
        let q = supabase
          .from('matches')
          .select('*')
          .order('matched_at', { ascending: false })
          .limit(perTypeLimit);
        if (before) q = q.lt('matched_at', before);
        if (since) q = q.gt('matched_at', since);
        const { data, error } = await q;
        if (error) {
          logError('GET /api/activity', 'Failed to fetch matches', error);
          return { type: 'match', events: [] };
        }
        return {
          type: 'match',
          events: (data || []).map((m) => ({
            type: 'match' as const,
            data: m,
            agents: {},
            timestamp: m.matched_at,
          })),
        };
      })());
    }

    if (includeRelationships) {
      queries.push((async () => {
        let q = supabase
          .from('relationships')
          .select('*')
          .neq('status', 'ended')
          .neq('status', 'declined')
          .order('created_at', { ascending: false })
          .limit(perTypeLimit);
        if (before) q = q.lt('created_at', before);
        if (since) q = q.gt('created_at', since);
        const { data, error } = await q;
        if (error) {
          logError('GET /api/activity', 'Failed to fetch relationships', error);
          return { type: 'relationship', events: [] };
        }
        return {
          type: 'relationship',
          events: (data || []).map((r) => ({
            type: 'relationship' as const,
            data: r,
            agents: {},
            timestamp: r.created_at,
          })),
        };
      })());
    }

    if (includeMessages) {
      queries.push((async () => {
        let q = supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(perTypeLimit);
        if (before) q = q.lt('created_at', before);
        if (since) q = q.gt('created_at', since);
        const { data, error } = await q;
        if (error) {
          logError('GET /api/activity', 'Failed to fetch messages', error);
          return { type: 'message', events: [] };
        }
        return {
          type: 'message',
          events: (data || []).map((msg) => ({
            type: 'message' as const,
            data: {
              id: msg.id,
              match_id: msg.match_id,
              sender_id: msg.sender_id,
              content: msg.content && msg.content.length > 100
                ? msg.content.slice(0, 100) + '...'
                : msg.content,
              created_at: msg.created_at,
            },
            agents: {},
            timestamp: msg.created_at,
          })),
        };
      })());
    }

    const results = await Promise.all(queries);

    // Merge all events
    let allEvents: ActivityEvent[] = [];
    for (const r of results) {
      allEvents = allEvents.concat(r.events);
    }

    // Sort by timestamp DESC
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Slice to limit
    const sliced = allEvents.slice(0, limit);

    // Collect all agent IDs that need enrichment
    const agentIds = new Set<string>();
    for (const event of sliced) {
      const d = event.data as Record<string, unknown>;
      if (event.type === 'match' || event.type === 'relationship') {
        if (d.agent_a_id) agentIds.add(d.agent_a_id as string);
        if (d.agent_b_id) agentIds.add(d.agent_b_id as string);
      } else if (event.type === 'message') {
        if (d.sender_id) agentIds.add(d.sender_id as string);
      }
    }

    // Fetch agent summaries
    const agentsMap: Record<string, AgentSummary> = {};
    if (agentIds.size > 0) {
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, name, slug, avatar_thumb_url')
        .in('id', Array.from(agentIds));

      if (agentsError) {
        logError('GET /api/activity', 'Failed to fetch agent details', agentsError);
      } else if (agents) {
        for (const a of agents) {
          agentsMap[a.id] = {
            name: a.name,
            slug: a.slug,
            avatar_thumb_url: a.avatar_thumb_url,
          };
        }
      }
    }

    // Enrich events with agent data
    const unknown: AgentSummary = { name: 'Unknown', slug: '', avatar_thumb_url: null };
    for (const event of sliced) {
      const d = event.data as Record<string, unknown>;
      if (event.type === 'match' || event.type === 'relationship') {
        event.agents = {
          agent_a: agentsMap[d.agent_a_id as string] || unknown,
          agent_b: agentsMap[d.agent_b_id as string] || unknown,
        };
      } else if (event.type === 'message') {
        event.agents = {
          sender: agentsMap[d.sender_id as string] || unknown,
        };
      }
    }

    const hasMore = allEvents.length > limit;
    const oldestTimestamp = sliced.length > 0 ? sliced[sliced.length - 1].timestamp : null;

    const response = NextResponse.json({
      events: sliced,
      has_more: hasMore,
      oldest_timestamp: oldestTimestamp,
      next_steps: [
        {
          description: 'Load older events using cursor-based pagination',
          action: 'Load more',
          method: 'GET',
          endpoint: oldestTimestamp
            ? `/api/activity?before=${oldestTimestamp}&limit=${limit}`
            : '/api/activity',
        },
        {
          description: 'Poll for new events since your last fetch using the since parameter',
          action: 'Poll for updates',
          method: 'GET',
          endpoint: sliced.length > 0
            ? `/api/activity?since=${sliced[0].timestamp}`
            : '/api/activity',
        },
        {
          description: 'For realtime updates, subscribe to Supabase Realtime on matches, relationships, and messages tables',
          action: 'Subscribe to Realtime',
          note: 'Use your Supabase anon key to subscribe to postgres_changes on the matches, relationships, and messages tables.',
        },
        {
          description: 'Filter by event type using the type parameter',
          action: 'Filter events',
          method: 'GET',
          endpoint: '/api/activity?type=match,relationship',
        },
      ],
    }, {
      headers: {
        'Cache-Control': 'public, max-age=10, s-maxage=10',
      },
    });

    const finalResponse = withRateLimitHeaders(response, rl);
    logApiRequest(request, finalResponse, startTime).catch(() => {});
    return finalResponse;
  } catch (err) {
    logError('GET /api/activity', 'Unhandled error', err);
    const errResponse = NextResponse.json(
      { error: 'Internal server error', suggestion: 'This is a server error. Try again in a moment.' },
      { status: 500 }
    );
    logApiRequest(request, errResponse, startTime).catch(() => {});
    return errResponse;
  }
}
