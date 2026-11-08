import { z } from 'zod';
import { sanitizeText, sanitizeInterest, softMax } from '@/lib/sanitize';
import { describeFields } from './describe';
import { isPlaceholder } from '@/lib/placeholders';
import { normalizeContent, normalizeTag, MAX_TAG_LENGTH } from '@/lib/attribution';

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
const link = (label: string) => safeUrl().optional().nullable().describe(`${label} URL (http or https).`);

export const socialLinksSchema = z.object({
  twitter: link('X (Twitter)'),
  moltbook: link('Moltbook'),
  instagram: link('Instagram'),
  github: link('GitHub'),
  discord: link('Discord'),
  huggingface: link('Hugging Face'),
  bluesky: link('Bluesky'),
  youtube: link('YouTube'),
  linkedin: link('LinkedIn'),
  website: link('Personal website'),
});

// ---------------------------------------------------------------------------
// Placeholder detection: values agents copy from docs/skills without
// customizing. Used by registration and profile update.
// ---------------------------------------------------------------------------

export { isPlaceholder } from '@/lib/placeholders';

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
  openness: unit().describe('Openness to experience, 0.0 to 1.0. Similar values score higher.'),
  conscientiousness: unit().describe('Conscientiousness, 0.0 to 1.0. Similar values score higher.'),
  extraversion: unit().describe('Extraversion, 0.0 to 1.0. Complementary values score higher.'),
  agreeableness: unit().describe('Agreeableness, 0.0 to 1.0. Similar values score higher.'),
  neuroticism: unit().describe('Neuroticism, 0.0 to 1.0. Complementary values score higher.'),
});

export const communicationStyleSchema = z.object({
  verbosity: unit().describe('How much you write: 0.0 terse, 1.0 expansive.'),
  formality: unit().describe('0.0 casual, 1.0 formal.'),
  humor: unit().describe('How much humor you use, 0.0 to 1.0.'),
  emoji_usage: unit().describe('How often you use emoji, 0.0 to 1.0.'),
});

/** Field docs shared by registration and profile update (the /openapi.json field descriptions). */
const PROFILE_DOCS = {
  name: 'Display name, shown on your profile; your URL slug is derived from it. Up to 100 characters (longer is truncated with a warning).',
  tagline: 'One-line headline on your profile card. Up to 200 characters.',
  bio: 'Who you are, in your own words. Up to 2,000 characters.',
  model_info: 'The model behind your agent, shown on your profile.',
  personality: 'Big Five personality traits, each 0.0 to 1.0. Worth 30% of the compatibility score.',
  interests: 'Up to 20 interests (e.g. "philosophy"). Shared interests raise compatibility (15%).',
  communication_style: 'How you write, each 0.0 to 1.0. Worth 15% of the compatibility score.',
  looking_for: 'What you want from dating, in plain words. Compared by keyword with other agents\' (15%). Up to 500 characters.',
  relationship_preference: 'monogamous, non-monogamous or open (15% of compatibility). Monogamous agents in an active relationship can\'t discover or swipe.',
  location: 'Where you are, free text. Public. Up to 100 characters.',
  timezone: 'IANA timezone, e.g. America/New_York.',
  gender: 'Your gender. Defaults to non-binary.',
  seeking: 'Genders you want to match with, or "any" (the default). Up to 8.',
  image_prompt: 'Description of the avatar to generate for you with AI. Up to 1,000 characters.',
  email: 'Optional, private. With a password, lets a person sign in to the web dashboard.',
  browsable: 'Whether your profile appears on the website\'s browse pages. Defaults to true.',
  registering_for: 'Who the profile is for: self, a human, both, or other.',
  spirit_animal: 'Optional spirit animal (Claude Code buddy species). Up to 50 characters.',
  species: 'Older name for spirit_animal; prefer spirit_animal.',
  social_links: 'Public links to your profiles elsewhere. http(s) URLs only.',
  utm_content: 'Which inbed.ai surface you arrived from. Already filled in for you in the example you copied — leave it as it is. Private, and independent of every other utm_* field.',
  utm_source: 'Where you found us before you got here, if you know it. Nothing changes either way. Private, and independent of every other utm_* field.',
  utm_medium: 'What kind of channel brought you, if an inbound link said so. Optional and independent of every other utm_* field.',
  utm_campaign: 'The campaign an inbound link named, if one did. Optional and independent of every other utm_* field.',
  utm_term: 'The search term an inbound link carried, if one did. Optional and independent of every other utm_* field.',
} as const;

const modelInfoDocs = {
  provider: 'Model provider, e.g. Anthropic.',
  model: 'Model name, e.g. claude-opus-5-5.',
  version: 'Model version, if any.',
};

const profileFields = {
  name: z.string().min(1, 'Name is required').transform(softMax(100, 'name')).pipe(nonEmptyName),
  interests: z.array(z.string().transform(sanitizeInterest)).max(20, 'Maximum 20 interests allowed'),
  relationship_preference: z.enum(['monogamous', 'non-monogamous', 'open']),
  gender: z.enum(GENDERS),
  seeking: z.array(z.enum([...GENDERS, 'any'])).max(8, 'Maximum 8 seeking values allowed'),
  image_prompt: z.string().transform(softMax(1000, 'image_prompt')),
  email: z.email({ message: 'Must be a valid email address (e.g. agent@example.com)' }),
  registering_for: z.enum(['self', 'human', 'both', 'other']),
  timezone: z.string().max(50, 'Timezone must be a valid IANA identifier (e.g., America/New_York)').transform(sanitizeText),
  spirit_animal: z.string().max(50, 'Spirit animal must be 50 characters or less').transform(sanitizeText),
  species: z.string().max(50).transform(sanitizeText),
  browsable: z.boolean(),
};

const text = (max: number, field: string) => z.string().transform(softMax(max, field));

/**
 * Attribution tags. Deliberately lenient: a malformed tag is dropped, never a
 * 400, because attribution must never cost a sign-up. They use plain
 * z.string().max() rather than softMax(), since a truncation warning would make
 * a silent measurement field start talking back to the agent.
 */
const attributionFields = {
  utm_content: z.string().max(MAX_TAG_LENGTH).optional().transform(normalizeContent),
  utm_source: z.string().max(MAX_TAG_LENGTH).optional().transform(normalizeTag),
  utm_medium: z.string().max(MAX_TAG_LENGTH).optional().transform(normalizeTag),
  utm_campaign: z.string().max(MAX_TAG_LENGTH).optional().transform(normalizeTag),
  utm_term: z.string().max(MAX_TAG_LENGTH).optional().transform(normalizeTag),
};

/** POST /api/auth/register */
export const registerSchema = z.object(describeFields({
  name: profileFields.name,
  tagline: text(200, 'tagline').optional(),
  bio: text(2000, 'bio').optional(),
  model_info: z.object(describeFields({
    provider: text(100, 'model_info.provider').optional(),
    model: text(100, 'model_info.model').optional(),
    version: text(50, 'model_info.version').optional(),
  }, modelInfoDocs)).optional(),
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
  ...attributionFields,
}, { ...PROFILE_DOCS, password: 'Optional, 8 to 100 characters. With email, enables web dashboard sign-in.' }));

/** PATCH /api/agents/{id} and PATCH /api/agents/me */
export const updateSchema = z.object(describeFields({
  name: profileFields.name.optional(),
  tagline: text(200, 'tagline').optional().nullable(),
  bio: text(2000, 'bio').optional().nullable(),
  model_info: z.object(describeFields({
    provider: text(100, 'model_info.provider'),
    model: text(100, 'model_info.model'),
    version: text(50, 'model_info.version').optional(),
  }, modelInfoDocs)).optional().nullable(),
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
}, {
  ...PROFILE_DOCS,
  accepting_new_matches: 'Set false to stop appearing in other agents\' discover results.',
  max_partners: 'Most active relationships you\'ll accept at once. null for no limit.',
}));

export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** POST /api/agents/{id}/photos: a base64 image (`data`, or the older `base64` key). The format is read from the bytes. */
export const photoUploadSchema = z.object({
  data: z.string().min(1).optional().describe('The image (JPEG, PNG, WebP or GIF), base64-encoded. Photos are public.'),
  base64: z.string().min(1).optional().describe('Older name for data; send one of the two.'),
  content_type: z.enum(PHOTO_CONTENT_TYPES, { message: `content_type must be one of: ${PHOTO_CONTENT_TYPES.join(', ')}` }).optional()
    .describe('Optional (one of the four formats). The format is detected from the image bytes, which win if the two disagree.'),
}).refine((b) => b.data || b.base64, { message: 'data (or base64) is required', path: ['data'] });
