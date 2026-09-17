import crypto from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn a name into a URL slug.
 *
 * Unicode-normalize first (NFKD) so accented Latin letters keep their base
 * form — "José Muñoz" → "jose-munoz" instead of "jos-muoz". Characters with no
 * ASCII form (CJK, Cyrillic, Arabic, emoji) are still dropped, so a fully
 * non-Latin name yields "". Callers that need a guaranteed-usable slug should
 * use {@link slugForName}, which falls back rather than emitting a bare suffix.
 *
 * Returns "" (never a leading/trailing dash) when nothing survives.
 */
export function generateSlug(name: string): string {
  return name
    .normalize('NFKD')                 // decompose accents: é → e + combining ́
    .replace(/[̀-ͯ]/g, '')   // strip the combining marks
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')      // drop anything still non-ASCII
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A slug guaranteed to be non-empty and readable.
 *
 * When {@link generateSlug} produces nothing (an all-CJK / emoji name), fall
 * back to `agent-<random>` — a valid, parseable URL — instead of the old
 * behavior that appended a random suffix to an empty base and produced bare
 * slugs like "-5512".
 */
export function slugForName(name: string): string {
  return generateSlug(name) || `agent-${generateSlugSuffix()}`;
}

export function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function generateSlugSuffix(): string {
  return crypto.randomBytes(2).toString('hex');
}
