/**
 * Strip HTML tags from a string while preserving text content.
 * Supports UTF-8, emojis, and international characters.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Remove dangerous control characters while keeping normal whitespace,
 * emojis, and international characters.
 *
 * Removes: null bytes, C0 controls (except \t \n \r), C1 controls,
 * bidirectional overrides (U+202A-U+202E, U+2066-U+2069),
 * zero-width chars (U+200B-U+200F, U+FEFF)
 */
export function stripControlChars(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')        // C0 controls (keep \t \n \r)
    .replace(/[\u0080-\u009F]/g, '')                             // C1 controls
    .replace(/[\u200B-\u200F\uFEFF]/g, '')                      // Zero-width chars
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '');              // Bidi overrides
}

/**
 * Full sanitization: strip HTML, strip control chars, trim whitespace.
 * Safe for UTF-8, emojis, and international text.
 */
export function sanitizeText(input: string): string {
  return stripControlChars(stripHtml(input)).trim();
}

/**
 * Sanitize a single interest tag: sanitize text, limit length.
 * Tracks truncation if the interest exceeds 50 chars.
 */
export function sanitizeInterest(input: string): string {
  const clean = sanitizeText(input);
  if (clean.length > 50) {
    _truncatedFields.push('interests');
    return clean.slice(0, 50);
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Graceful truncation: accept over-length text, truncate at word boundary, warn
// ---------------------------------------------------------------------------

/** Per-request tracking of truncated fields */
let _truncatedFields: string[] = [];

/** Reset before each request's validation */
export function resetTruncationTracker(): void {
  _truncatedFields = [];
}

/** Get list of fields that were truncated in this request */
export function getTruncatedFields(): string[] {
  return [...new Set(_truncatedFields)]; // dedupe (e.g. multiple interests)
}

/**
 * Zod .transform() that sanitizes + truncates at word boundary + tracks.
 * Use instead of `.max(N).transform(sanitizeText)` for free-text fields.
 *
 * @example
 *   bio: z.string().transform(softMax(2000, 'bio')).optional()
 */
export function softMax(maxLen: number, fieldName: string) {
  return (val: string): string => {
    const clean = sanitizeText(val);
    if (clean.length <= maxLen) return clean;
    const cut = clean.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    const result = lastSpace > maxLen * 0.8 ? cut.slice(0, lastSpace) : cut;
    _truncatedFields.push(fieldName);
    return result;
  };
}

/**
 * Build a truncation warning object for the response, or null if nothing was truncated.
 * Spread into your response JSON: `...(buildTruncationWarning() || {})`
 */
export function buildTruncationWarning(): { truncated_fields: string[]; warning: string } | null {
  const fields = getTruncatedFields();
  if (fields.length === 0) return null;
  return {
    truncated_fields: fields,
    warning: `The following fields were truncated to fit length limits: ${fields.join(', ')}. Consider shortening them.`,
  };
}
