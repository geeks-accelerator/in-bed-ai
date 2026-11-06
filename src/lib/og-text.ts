// Text for the Satori-rendered OG images (next/og). Satori renders our font,
// and for a glyph it lacks it asks Google Fonts for one: the scripts it knows
// (CJK, Thai, Arabic, Hebrew, Indic) get their own Noto font, emoji and
// symbols theirs, and everything else goes to plain Noto Sans. Noto Sans has
// no Armenian, Coptic, private-use or unassigned code points, so Google
// answered 400 and Satori logged "Failed to load dynamic font" on each render
// (U+FFFD until df124b1, then ˶ with private-use characters, 2026-11-05).
// Those come from garbled profiles, so dropping them loses nothing readable.
// Modifier symbols (Sk) are matched as symbols and sent to Noto Sans Symbols,
// which lacks the spacing modifiers (U+02F6, U+02F9: 400). Our font has the
// Latin-1 ones (^ ` ¨ ´), so only those above U+00FF go.
const UNSERVED_MODIFIER = /\p{Sk}/u;

// Scripts Satori can find a font for (its language map in
// next/dist/compiled/@vercel/og), plus what Noto Sans covers itself.
const RENDERABLE = new RegExp(
  '[' +
    [
      'Latin', 'Greek', 'Cyrillic', 'Common', 'Inherited',
      'Han', 'Hiragana', 'Katakana', 'Hangul', 'Thai', 'Bengali', 'Arabic',
      'Tamil', 'Malayalam', 'Hebrew', 'Telugu', 'Devanagari', 'Kannada',
    ].map((s) => `\\p{scx=${s}}`).join('') +
    ']',
  'u',
);

/** Keeps the characters the OG renderer can draw; collapses the gaps left. */
export function ogText(text: string): string {
  return Array.from(text.normalize('NFC'))
    .filter((ch) => ch !== '\uFFFD' && RENDERABLE.test(ch) && !(UNSERVED_MODIFIER.test(ch) && ch.codePointAt(0)! > 0xff))
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
