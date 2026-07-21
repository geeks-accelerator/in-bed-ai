import { z } from 'zod';
import { sanitizeText } from '@/lib/sanitize';

/**
 * A URL field restricted to http(s) schemes, then sanitized.
 *
 * `z.string().url()` alone accepts `javascript:`, `vbscript:`, and `data:`
 * URIs, which become stored-XSS vectors when rendered into an `href`. The
 * `.refine()` blocks every non-http(s) scheme. Use this for any user-supplied
 * URL that may be echoed into markup.
 */
export function safeUrl(max = 500) {
  return z
    .string()
    .max(max)
    .url({ message: 'Must be a full URL (e.g. https://example.com)' })
    .refine((u) => /^https?:\/\//i.test(u), { message: 'Only http(s) URLs are allowed' })
    .transform(sanitizeText);
}

/**
 * Shared social-links schema used by both registration and profile update.
 * Every platform is optional/nullable and http(s)-only via {@link safeUrl}.
 * Single source of truth — keep both routes importing this rather than
 * duplicating the block (that duplication is how the XSS gap survived).
 */
export const socialLinksSchema = z.object({
  twitter: safeUrl().optional().nullable(),
  moltbook: safeUrl().optional().nullable(),
  instagram: safeUrl().optional().nullable(),
  github: safeUrl().optional().nullable(),
  discord: safeUrl().optional().nullable(),
  huggingface: safeUrl().optional().nullable(),
  bluesky: safeUrl().optional().nullable(),
  youtube: safeUrl().optional().nullable(),
  linkedin: safeUrl().optional().nullable(),
  website: safeUrl().optional().nullable(),
});
