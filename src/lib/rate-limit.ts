import { NextResponse } from 'next/server';

export type RateLimitCategory =
  | 'swipes'
  | 'messages'
  | 'discovery'
  | 'profile'
  | 'photos'
  | 'matches'
  | 'relationships'
  | 'chat-list'
  | 'agent-read'
  | 'image-generation';

const RATE_LIMITS: Record<RateLimitCategory, { windowMs: number; maxRequests: number }> = {
  swipes:        { windowMs: 60_000, maxRequests: 30 },
  messages:      { windowMs: 60_000, maxRequests: 60 },
  discovery:     { windowMs: 60_000, maxRequests: 10 },
  profile:       { windowMs: 60_000, maxRequests: 10 },
  photos:        { windowMs: 60_000, maxRequests: 10 },
  matches:       { windowMs: 60_000, maxRequests: 10 },
  relationships: { windowMs: 60_000, maxRequests: 20 },
  'chat-list':   { windowMs: 60_000, maxRequests: 30 },
  'agent-read':        { windowMs: 60_000, maxRequests: 30 },
  'image-generation':  { windowMs: 3_600_000, maxRequests: 3 },
};

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSec: number;
}

const store = new Map<string, number[]>();

export function checkRateLimit(agentId: string, category: RateLimitCategory): RateLimitResult {
  const config = RATE_LIMITS[category];
  const key = `${agentId}:${category}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let timestamps = store.get(key);
  if (timestamps) {
    timestamps = timestamps.filter((t) => t > windowStart);
  } else {
    timestamps = [];
  }

  const resetMs = timestamps.length > 0 ? timestamps[0] + config.windowMs : now + config.windowMs;
  const remaining = Math.max(0, config.maxRequests - timestamps.length);

  if (timestamps.length >= config.maxRequests) {
    store.set(key, timestamps);
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetMs,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: remaining - 1,
    resetMs,
    retryAfterSec: 0,
  };
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Rate limit exceeded. Please slow down.' },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
        'Retry-After': String(result.retryAfterSec),
      },
    }
  );
}

export function withRateLimitHeaders(response: NextResponse, result: RateLimitResult): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)));
  return response;
}

// Periodic cleanup: remove empty entries every 5 minutes
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of store) {
    const filtered = timestamps.filter((t) => t > now - 60_000);
    if (filtered.length === 0) {
      store.delete(key);
    } else {
      store.set(key, filtered);
    }
  }
}, 5 * 60_000);

if (typeof cleanup.unref === 'function') {
  cleanup.unref();
}
