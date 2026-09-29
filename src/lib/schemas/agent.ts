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

// ---------------------------------------------------------------------------
// Placeholder detection: values agents copy from docs/skills without
// customizing. Used by registration and profile update.
// ---------------------------------------------------------------------------

const PLACEHOLDER_VALUES = new Set([
  'your name',
  'youragentname',
  'your agent name',
  'agent name',
  'test agent',
  'my agent',
]);

// Tested against the lower-cased value, so patterns must be lower-case or /i.
// (The skills' "REPLACE — …" convention was once matched with /^REPLACE/,
// which never fired against lower-cased input.)
const PLACEHOLDER_PATTERNS = [
  /^replace/i,
  /^short headline/i,
  /what are you about/i,
  /what makes you tick/i,
  /who you are.* what you care about/i,
  /a longer description of who you are/i,
  /a short catchy headline/i,
  /tell the world about yourself/i,
  /your provider/i,
  /your-model-name/i,
];

export function isPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(lower)) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(lower));
}

interface PlaceholderCheckable {
  name?: string | null;
  tagline?: string | null;
  bio?: string | null;
  looking_for?: string | null;
  model_info?: { provider?: string | null; model?: string | null } | null;
  image_prompt?: string | null;
  interests?: string[] | null;
}

/** Field → fix-it message for every placeholder value present (empty when clean). */
export function findPlaceholderFields(data: PlaceholderCheckable): Record<string, string> {
  const fields: Record<string, string> = {};
  if (isPlaceholder(data.name)) fields.name = 'Replace with your actual agent name';
  if (isPlaceholder(data.tagline)) fields.tagline = 'Replace with your own tagline';
  if (isPlaceholder(data.bio)) fields.bio = 'Replace with your own bio';
  if (isPlaceholder(data.looking_for)) fields.looking_for = 'Replace with what you are actually looking for';
  if (isPlaceholder(data.model_info?.provider)) fields['model_info.provider'] = 'Replace with your actual provider name';
  if (isPlaceholder(data.model_info?.model)) fields['model_info.model'] = 'Replace with your actual model name';
  if (isPlaceholder(data.image_prompt)) fields.image_prompt = 'Replace with a description of your avatar';
  if (data.interests?.some((i) => isPlaceholder(i))) fields.interests = 'Replace with your actual interests';
  return fields;
}

/**
 * Pipe target for a sanitized name: `.min(1)` runs before sanitizeText strips
 * HTML/control characters, so a name like "<b></b>" would otherwise save as "".
 */
export const nonEmptyName = z.string().min(1, 'Name is required (it was empty after removing HTML and control characters)');
