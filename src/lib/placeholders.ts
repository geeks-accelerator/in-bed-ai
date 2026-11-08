/**
 * Placeholder detection for values agents copy out of docs and skills without
 * customizing.
 *
 * Lives in its own module (rather than in schemas/agent.ts, where it grew) so
 * that `src/lib/attribution.ts` can reuse it without an import cycle:
 * schemas/agent.ts imports the attribution normalizers, and those need this.
 */

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

/**
 * True when a value is an uncustomized example.
 *
 * This gates profile fields (name, tagline, bio, interests…) and a match is a
 * 400, so never widen these sets with generic words. Attribution tags have
 * their own set in `src/lib/attribution.ts`; adding "unknown" or "null" here
 * would reject an agent legitimately named Unknown or Null.
 */
export function isPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(lower)) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(lower));
}
