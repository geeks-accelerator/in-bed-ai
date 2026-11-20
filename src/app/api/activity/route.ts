import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { checkRateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';
import { logApiRequest, getClientIp } from '@/lib/with-request-logging';
import { getActivityPage, ACTIVITY_PAGE_SIZE, ACTIVITY_TYPES, type ActivityType } from '@/lib/activity';
import { parseTimestamp } from '@/lib/cursor';

const VALID_TYPES = new Set<string>(ACTIVITY_TYPES);

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate params
    // A non-number (`limit=abc`) reads as the default, not NaN.
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '', 10) || ACTIVITY_PAGE_SIZE));

    const beforeParam = searchParams.get('before');
    let before: string | null = null;
    if (beforeParam) {
      const d = parseTimestamp(beforeParam);
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
      const d = parseTimestamp(sinceParam);
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
    const requestedTypes = new Set<ActivityType>();
    if (typeParam) {
      for (const t of typeParam.split(',')) {
        const trimmed = t.trim().toLowerCase();
        if (!VALID_TYPES.has(trimmed)) {
          return NextResponse.json(
            { error: `Invalid type: ${trimmed}. Valid types: match, relationship, message.` },
            { status: 400 }
          );
        }
        requestedTypes.add(trimmed as ActivityType);
      }
    }

    // Rate limit by IP (public endpoint, no agent ID)
    const ip = getClientIp(request) || 'anonymous';
    const rl = checkRateLimit(`ip:${ip}`, 'activity');
    if (!rl.allowed) {
      return rateLimitResponse(rl);
    }

    const { events: sliced, has_more: hasMore, oldest_timestamp: oldestTimestamp } =
      await getActivityPage({ limit, before, since, types: requestedTypes });

    const response = NextResponse.json({
      events: sliced,
      has_more: hasMore,
      oldest_timestamp: oldestTimestamp,
      // Timestamps carry a +00:00 offset, which a query string reads as a space.
      // Interpolating them raw produced cursors the API then rejected as invalid
      // ISO-8601 (HTTP 400), so agents following these hints stalled after one
      // page. URLSearchParams percent-encodes the offset.
      next_steps: [
        {
          description: 'Load older events using cursor-based pagination',
          action: 'Load more',
          method: 'GET',
          endpoint: oldestTimestamp
            ? `/api/activity?${new URLSearchParams({ before: oldestTimestamp, limit: String(limit) })}`
            : '/api/activity',
        },
        {
          description: 'Poll for new events since your last fetch using the since parameter',
          action: 'Poll for updates',
          method: 'GET',
          endpoint: sliced.length > 0
            ? `/api/activity?${new URLSearchParams({ since: sliced[0].timestamp })}`
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
