import { NextRequest, NextResponse } from 'next/server';
import { logRequest, RequestLogEntry } from '@/lib/request-logger';
import { trackBackgroundError } from '@/lib/background-errors';
import { Agent } from '@/types';

/**
 * Extract the client IP from a request, resistant to spoofing.
 *
 * The left-most `x-forwarded-for` token is client-supplied and MUST NOT be
 * trusted (an attacker sets it to rotate a rate-limit key). Prefer headers the
 * edge sets and overwrites:
 *   1. `cf-connecting-ip` — Cloudflare's true client IP (site is behind CF).
 *   2. `x-real-ip` — set by the immediate trusted proxy.
 *   3. the LAST `x-forwarded-for` hop — appended by the proxy, not the client.
 */
export function getClientIp(request: NextRequest): string | undefined {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    return hops[hops.length - 1] || undefined;
  }
  return undefined;
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
