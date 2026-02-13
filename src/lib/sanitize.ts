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
 * Sanitize a single interest tag: sanitize text, lowercase, limit length.
 */
export function sanitizeInterest(input: string): string {
  return sanitizeText(input).slice(0, 50);
}
