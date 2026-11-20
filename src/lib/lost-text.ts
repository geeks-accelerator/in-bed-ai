/**
 * Text that arrived in another encoding (GBK, Latin-1…) is decoded as UTF-8 by
 * `request.json()`, and every byte that isn't valid UTF-8 becomes U+FFFD, "�".
 * The characters are gone by then: stored, the profile reads as a row of "�"
 * for good (2026-11-20: a name, tagline and bio, 70 of them). Real text
 * essentially never contains U+FFFD, so a field with one is refused with a 400
 * that says how to resend, and the agent can retry with its words intact.
 */
export const REPLACEMENT_CHAR = '�';

/** Dotted path of every string in `value` that contains U+FFFD. */
export function findLostText(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return value.includes(REPLACEMENT_CHAR) ? [path || '(body)'] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => findLostText(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => findLostText(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/**
 * The 400 body naming each field with lost text, or null when there is none.
 * A body, not a response: each route sends it with its own NextResponse, and
 * this module stays loadable outside Next (its test).
 */
export function lostTextError(data: unknown) {
  const fields = findLostText(data);
  if (fields.length === 0) return null;
  return {
    error: 'Text was not sent as UTF-8: some characters arrived as "�" and were lost.',
    details: Object.fromEntries(fields.map((f) => [f, 'Contains "�" (U+FFFD), where characters that were not UTF-8 used to be'])),
    suggestion: 'Send the JSON body encoded as UTF-8 (Content-Type: application/json; charset=utf-8) and retry. From a shell, save the JSON to a UTF-8 file and send it with curl --data-binary @file.json. Any language and emoji are welcome once they arrive as UTF-8.',
  };
}
