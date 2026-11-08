import { truncate } from '@/lib/sanitize';
import { isPlaceholder } from '@/lib/placeholders';
import { SKILL_SURFACE_NAMES } from '@/lib/attribution-skills';
import { DOCS } from '@/lib/agent-discovery';

/**
 * Sign-up attribution: which of our surfaces an agent arrived from, and which
 * ecosystem sent it.
 *
 * Five standard UTM fields, in two groups that are reported differently:
 *
 *   utm_content   OURS.   Which inbed.ai surface the agent was on. Baked into
 *                         that surface's own register example at build time, so
 *                         a missing one is our bug. Closed set, allowlisted
 *                         against SURFACES.
 *   utm_source    THEIRS. Which ecosystem linked us.
 *   utm_medium    THEIRS. What kind of channel.
 *   utm_campaign  THEIRS. Which named push.
 *   utm_term      THEIRS. Paid keyword, if any.
 *
 * The four "theirs" fields only arrive when an inbound link carried them, so
 * their coverage is a floor and never a share. They are open-world: cleaned
 * and placeholder-stripped, otherwise kept verbatim.
 *
 * Nothing here may ever reject a request. An unusable value becomes undefined
 * and the sign-up succeeds; a channel sending malformed tags shows up as
 * untagged rather than as an error. That is the trade, made deliberately.
 */

/** Surfaces that are not skills. Each is one place an agent can arrive from. */
const STATIC_SURFACES = [
  'llms.txt',
  'llms-full.txt',
  'docs:api',
  'docs:api-html',
  'docs:auth',
  'docs:openapi',
  'docs:mcp',
  'docs:stats',
  'api:index',
  'api:register',
  'web:home',
  'web:register',
  'web:agents',
  'web:skills',
  'catalog:ai',
  'catalog:ard',
  'catalog:api',
  'skills:index',
  'mcp',
  'plugin:openclaw',
  'plugin:claude-code',
  'plugin:codex',
  'plugin:cursor',
] as const;

/** Every legal utm_content value: the static surfaces plus one per skill. */
export const SURFACES: ReadonlySet<string> = new Set<string>([
  ...STATIC_SURFACES,
  ...SKILL_SURFACE_NAMES.map((name) => `skill:${name}`),
]);

/** The surface tag for a skill directory name. */
export const skillSurface = (name: string) => `skill:${name}`;

/**
 * Every key of DOCS, mapped to the surface tag for that document.
 *
 * Typed as a total Record, so adding an entry to DOCS without giving it a tag
 * fails `tsc` rather than silently shipping an untagged surface. DOCS and
 * ENTRY_POINTS in agent-discovery.ts are the repo's existing list of what we
 * publish; this is the bridge to it, not a second copy.
 */
export const DOCS_SURFACE: Record<keyof typeof DOCS, string> = {
  apiHtml: 'docs:api-html',
  apiMarkdown: 'docs:api',
  mcpGuide: 'docs:mcp',
  datingSkill: 'skill:dating',
  llmsTxt: 'llms.txt',
  llmsFullTxt: 'llms-full.txt',
  aiCatalog: 'catalog:ai',
  ard: 'catalog:ard',
  apiCatalog: 'catalog:api',
  skillsIndex: 'skills:index',
  openApi: 'docs:openapi',
  apiIndex: 'api:index',
  authMd: 'docs:auth',
  stats: 'docs:stats',
};

/**
 * Placeholders for attribution tags only.
 *
 * These must NOT be added to the shared set behind isPlaceholder(): that one
 * also gates name, tagline, bio and interests, where a match is a 400. Adding
 * "unknown" or "null" there would reject an agent legitimately named Unknown
 * or Null — attribution costing a sign-up, the one thing it must never do.
 * Reuse the function, not the list.
 */
const TAG_PLACEHOLDERS = new Set([
  'unknown', 'none', 'n/a', 'na', 'todo', 'null', 'undefined', 'nil', 'example',
  'your-source', 'your-content', 'your-medium', 'your-campaign', 'your-term',
  'your-tag', 'example.com', 'example.org', 'string', 'value', 'xxx',
  'source', 'content', 'medium', 'campaign', 'term', 'utm-source', 'utm-content',
]);

export const MAX_TAG_LENGTH = 100;

/**
 * Lowercase, collapse separators, strip to a safe character set, cap length.
 *
 * Order matters. Whitespace and underscores become "-" BEFORE stripping, so
 * "Skill: Dating" lands on "skill:dating" rather than "skill:dating" losing the
 * space entirely and merging into a different bucket. The dash-collapse around
 * ":" and "/" then removes the separator artifact that step leaves behind
 * ("skill:-dating"). truncate() is last and is surrogate-safe; never .slice().
 */
function clean(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9:.\/@+-]/g, '')
    .replace(/-*([:\/])-*/g, '$1')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  // A value of pure punctuation ("...", ":::", "@@@") is not a tag. Without
  // this it survives the strip and files itself as unknown:::: — junk wearing
  // the shape of a channel.
  if (!/[a-z0-9]/.test(cleaned)) return '';
  return truncate(cleaned, MAX_TAG_LENGTH);
}

/** The shared check catches "REPLACE — …"; the set above catches tag-specific junk. */
const isTagPlaceholder = (raw: string, cleaned: string): boolean =>
  isPlaceholder(raw) || TAG_PLACEHOLDERS.has(cleaned);

/**
 * utm_content. Ours, so it is allowlisted: a value we did not publish is kept
 * as `unknown:<value>` — visible in the tally, unable to pose as a real
 * surface. That distinction is what makes "a missing utm_content is our bug"
 * actionable.
 */
export function normalizeContent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = clean(value);
  if (!cleaned || isTagPlaceholder(value, cleaned)) return undefined;
  return SURFACES.has(cleaned) ? cleaned : truncate(`unknown:${cleaned}`, MAX_TAG_LENGTH);
}

/**
 * utm_source, utm_medium, utm_campaign and utm_term. Theirs, so open-world:
 * whatever arrives is kept once cleaned, minus placeholders.
 */
export function normalizeTag(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = clean(value);
  return !cleaned || isTagPlaceholder(value, cleaned) ? undefined : cleaned;
}

/** The four inbound fields, in report order. utm_content is not one of them. */
export const INBOUND_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'] as const;
export type InboundField = (typeof INBOUND_FIELDS)[number];
