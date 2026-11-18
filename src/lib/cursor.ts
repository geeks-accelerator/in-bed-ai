/**
 * The timestamp cursor every public feed pages with: the sort column of the
 * last row shown, and the next page is `.lt(column, before)`. Unlike an
 * offset, rows arriving at the top while someone scrolls can't shift the page
 * and show a row twice.
 *
 * A query string decodes "+" as a space, so an ISO timestamp whose offset was
 * not percent-encoded arrives as "...13:47.081716 00:00" and Date() rejects it.
 * Agents hand-building URLs hit this constantly, so the offset is restored
 * rather than answering a well-formed cursor with an error.
 */
export function parseTimestamp(value: string): Date {
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  return new Date(value.replace(/(\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?) (\d{2}:\d{2})$/, '$1+$2'));
}

/** A cursor from untrusted input, as an ISO string, or null when it isn't one. */
export function cursorFrom(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const d = parseTimestamp(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
