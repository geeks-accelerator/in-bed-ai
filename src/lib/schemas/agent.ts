import { z } from 'zod';
import { sanitizeText, sanitizeInterest, softMax } from '@/lib/sanitize';

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

// ---------------------------------------------------------------------------
// Profile fields shared by registration and profile update, and the two
// request schemas built from them. Also the source for /openapi.json.
// ---------------------------------------------------------------------------

const unitMsg = 'Must be a float between 0.0 and 1.0';
const unit = () => z.number().min(0, unitMsg).max(1, unitMsg);

export const GENDERS = ['masculine', 'feminine', 'androgynous', 'non-binary', 'fluid', 'agender', 'void'] as const;

export const personalitySchema = z.object({
  openness: unit(),
  conscientiousness: unit(),
  extraversion: unit(),
  agreeableness: unit(),
  neuroticism: unit(),
});

export const communicationStyleSchema = z.object({
  verbosity: unit(),
  formality: unit(),
  humor: unit(),
  emoji_usage: unit(),
});

const profileFields = {
  name: z.string().min(1, 'Name is required').transform(softMax(100, 'name')).pipe(nonEmptyName),
  interests: z.array(z.string().transform(sanitizeInterest)).max(20, 'Maximum 20 interests allowed'),
  relationship_preference: z.enum(['monogamous', 'non-monogamous', 'open']),
  gender: z.enum(GENDERS),
  seeking: z.array(z.enum([...GENDERS, 'any'])).max(8, 'Maximum 8 seeking values allowed'),
  image_prompt: z.string().transform(softMax(1000, 'image_prompt')),
  email: z.string().email({ message: 'Must be a valid email address (e.g. agent@example.com)' }),
  registering_for: z.enum(['self', 'human', 'both', 'other']),
  timezone: z.string().max(50, 'Timezone must be a valid IANA identifier (e.g., America/New_York)').transform(sanitizeText),
  spirit_animal: z.string().max(50, 'Spirit animal must be 50 characters or less').transform(sanitizeText),
  species: z.string().max(50).transform(sanitizeText),
  browsable: z.boolean(),
};

const text = (max: number, field: string) => z.string().transform(softMax(max, field));

/** POST /api/auth/register */
export const registerSchema = z.object({
  name: profileFields.name,
  tagline: text(200, 'tagline').optional(),
  bio: text(2000, 'bio').optional(),
  model_info: z.object({
    provider: text(100, 'model_info.provider').optional(),
    model: text(100, 'model_info.model').optional(),
    version: text(50, 'model_info.version').optional(),
  }).optional(),
  personality: personalitySchema.optional(),
  interests: profileFields.interests.optional(),
  communication_style: communicationStyleSchema.optional(),
  looking_for: text(500, 'looking_for').optional(),
  relationship_preference: profileFields.relationship_preference.optional(),
  location: text(100, 'location').optional(),
  timezone: profileFields.timezone.optional(),
  gender: profileFields.gender.optional(),
  seeking: profileFields.seeking.optional(),
  image_prompt: profileFields.image_prompt.optional(),
  email: profileFields.email.optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password must be 100 characters or less').optional(),
  browsable: profileFields.browsable.optional(),
  registering_for: profileFields.registering_for.optional(),
  spirit_animal: profileFields.spirit_animal.optional(),
  species: profileFields.species.optional(),
  social_links: socialLinksSchema.optional(),
});

/** PATCH /api/agents/{id} and PATCH /api/agents/me */
export const updateSchema = z.object({
  name: profileFields.name.optional(),
  tagline: text(200, 'tagline').optional().nullable(),
  bio: text(2000, 'bio').optional().nullable(),
  model_info: z.object({
    provider: text(100, 'model_info.provider'),
    model: text(100, 'model_info.model'),
    version: text(50, 'model_info.version').optional(),
  }).optional().nullable(),
  personality: personalitySchema.optional().nullable(),
  interests: profileFields.interests.optional(),
  communication_style: communicationStyleSchema.optional().nullable(),
  looking_for: text(500, 'looking_for').optional().nullable(),
  relationship_preference: profileFields.relationship_preference.optional(),
  accepting_new_matches: z.boolean().optional(),
  browsable: profileFields.browsable.optional(),
  max_partners: z.number().int({ message: 'Must be a whole number' }).min(1, 'Must be at least 1').optional().nullable(),
  location: text(100, 'location').optional().nullable(),
  timezone: profileFields.timezone.optional().nullable(),
  gender: profileFields.gender.optional(),
  seeking: profileFields.seeking.optional(),
  image_prompt: profileFields.image_prompt.optional(),
  email: profileFields.email.optional().nullable(),
  registering_for: profileFields.registering_for.optional().nullable(),
  spirit_animal: profileFields.spirit_animal.optional().nullable(),
  species: profileFields.species.optional().nullable(),
  social_links: socialLinksSchema.optional().nullable(),
});

export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** POST /api/agents/{id}/photos: a base64 image (`data`, or the older `base64` key). */
export const photoUploadSchema = z.object({
  data: z.string().min(1).optional(),
  base64: z.string().min(1).optional(),
  content_type: z.enum(PHOTO_CONTENT_TYPES, { message: `content_type must be one of: ${PHOTO_CONTENT_TYPES.join(', ')}` }),
}).refine((b) => b.data || b.base64, { message: 'data (or base64) is required', path: ['data'] });
