/**
 * Finding the register example inside a document.
 *
 * Every skill, guide and page that invites an agent to register ships a
 * `curl ... -d '{…}'` block. Three things need to read those blocks: the
 * tagging script, the test that proves every surface is tagged, and the
 * identity research corpus. They were drifting apart — the test had learned to
 * scope to the register call and to undo shell quoting, the script had not —
 * so the parser lives here once.
 */

export interface RegisterBlock {
  /** Offset of the body's opening brace in the source text. */
  start: number;
  /** Offset just past the body's closing brace. */
  end: number;
  /** The body exactly as written, shell escaping and all. */
  raw: string;
  /** Indentation of the closing brace, for inserting a key at the same depth. */
  indent: string;
  /** The body parsed as JSON. */
  json: Record<string, unknown>;
}

/**
 * `'\''` is the shell idiom for a literal apostrophe inside a single-quoted
 * string. The API receives a plain quote, so undo it before parsing or a
 * perfectly valid example looks like malformed JSON.
 */
export const unescapeShellQuotes = (s: string): string => s.replace(/'\\''/g, "'");

/**
 * Every register example in a document, in order.
 *
 * Scoped to the register call: a SKILL.md also shows curl for swipes, messages
 * and relationships, and matching `-d '{…}'` across the whole file picks those
 * up too. From each `/api/auth/register`, look no further than the end of that
 * code block or the start of the next command.
 */
export function findRegisterBlocks(text: string): RegisterBlock[] {
  const blocks: RegisterBlock[] = [];
  for (const at of text.matchAll(/\/api\/auth\/register/g)) {
    const from = at.index;
    const after = text.slice(from);
    const stop = after.slice(1).search(/\n```|\ncurl /);
    const segment = stop === -1 ? after : after.slice(0, stop + 1);
    // `}` immediately followed by `'` closes the body; a nested object closes
    // with `},` or `}\n`, so the non-greedy match cannot stop early.
    const m = /-d '(\{[\s\S]*?\})'/.exec(segment);
    if (!m) continue;
    const raw = m[1];
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(unescapeShellQuotes(raw)) as Record<string, unknown>;
    } catch {
      continue; // not a body we can read; the caller's test will catch it
    }
    const start = from + m.index + m[0].indexOf('{');
    blocks.push({
      start,
      end: start + raw.length,
      raw,
      indent: /\n([ \t]*)\}$/.exec(raw)?.[1] ?? '  ',
      json,
    });
  }
  return blocks;
}

/**
 * Add or refresh one key as the last entry of the first register example.
 *
 * Idempotent: an existing key has its value replaced in place, so the comma
 * separating it from the key before it is left exactly as it was. Returns null
 * when the document has no register example to tag.
 */
export function setRegisterExampleKey(text: string, key: string, value: string): string | null {
  const [block] = findRegisterBlocks(text);
  if (!block) return null;

  const existing = new RegExp(`"${key}":\\s*"[^"]*"`).exec(block.raw);
  const body = existing
    ? block.raw.replace(existing[0], `"${key}": "${value}"`)
    : `${block.raw.replace(/\n([ \t]*)\}$/, '')},\n${block.indent}  "${key}": "${value}"\n${block.indent}}`;

  return text.slice(0, block.start) + body + text.slice(block.end);
}
