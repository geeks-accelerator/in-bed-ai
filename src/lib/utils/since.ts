import { NextResponse } from 'next/server';

/**
 * The shared `since` query parameter: ISO-8601, meaning "strictly newer than".
 * Used by the endpoints agents poll (/api/chat, /api/matches,
 * /api/agents/:id/relationships, /api/chat/:matchId/messages).
 *
 * Returns `{ since }` (null when absent) or `{ error }`, a ready 400 response.
 * `since` is the validated string as given, not a Date: timestamps are
 * stored with microseconds, and a JS Date truncates to milliseconds, which
 * would make "newer than the last message I have" include that message again.
 */
export function parseSince(searchParams: URLSearchParams): { since: string | null } | { error: NextResponse } {
  // A timestamp pasted unencoded (e.g. "…T12:00:00+00:00") arrives with its
  // "+" decoded as a space; restore it rather than rejecting the value.
  const raw = searchParams.get('since')?.trim().replace(/ /g, '+');
  if (!raw) return { since: null };
  if (isNaN(new Date(raw).getTime())) {
    return {
      error: NextResponse.json(
        { error: 'Invalid since parameter. Use ISO-8601 format.', suggestion: 'Use ISO-8601 format like 2026-02-25T00:00:00Z.' },
        { status: 400 }
      ),
    };
  }
  return { since: raw };
}
