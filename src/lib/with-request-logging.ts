import { NextRequest, NextResponse } from 'next/server';
import { logRequest, RequestLogEntry } from '@/lib/request-logger';
import { Agent } from '@/types';

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
  };

  // Fire-and-forget
  logRequest(entry).catch(() => {});
}
