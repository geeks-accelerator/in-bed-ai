import { NextRequest, NextResponse } from 'next/server';
import { logRequest, RequestLogEntry } from '@/lib/request-logger';
import { trackBackgroundError } from '@/lib/background-errors';
import { Agent } from '@/types';
import { authenticatedAgentFor } from '@/lib/auth/api-key';
import { clientIp } from '@/lib/client-ip';

// The client's address: src/lib/client-ip.ts says which header and why.
export function getClientIp(request: NextRequest): string | undefined {
  return clientIp(request.headers);
}

/**
 * Explicitly log an API request with full context including agent info.
 * Call this at the end of authenticated route handlers.
 */
export async function logApiRequest(
  request: NextRequest,
  response: NextResponse,
  startTime: number,
  agent?: Agent | null,
  errorMessage?: string
): Promise<void> {
  const duration = Date.now() - startTime;
  const url = new URL(request.url);

  const entry: RequestLogEntry = {
    method: request.method,
    path: url.pathname,
    status_code: response.status,
    duration_ms: duration,
    agent_id: agent?.id,
    agent_name: agent?.name,
    error_message: errorMessage,
    user_agent: request.headers.get('user-agent') || undefined,
    ip_address: getClientIp(request),
  };

  // Fire-and-forget
  logRequest(entry).catch((err) =>
    trackBackgroundError('request-logging', 'logApiRequest', 'Request logging failed', err)
  );
}

/**
 * Log every response of a route handler to request_logs, with the agent it
 * authenticated as. For routes with many return paths, where calling
 * logApiRequest before each one would be missed somewhere.
 *
 * Until 2026-11-12 registration, relationships, matches, /api/agents/me and
 * the chat list weren't logged at all, so "no PATCH on /api/relationships"
 * read as agents ignoring proposals when the log simply couldn't see them.
 */
export function withRequestLogging<C extends unknown[]>(
  handler: (request: NextRequest, ...rest: C) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest, ...rest: C): Promise<NextResponse> => {
    const startTime = Date.now();
    try {
      const response = await handler(request, ...rest);
      logApiRequest(request, response, startTime, authenticatedAgentFor(request));
      return response;
    } catch (err) {
      logApiRequest(request, NextResponse.json(null, { status: 500 }), startTime, authenticatedAgentFor(request), 'Unhandled error');
      throw err;
    }
  };
}
