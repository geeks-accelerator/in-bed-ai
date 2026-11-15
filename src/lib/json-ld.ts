// JSON-LD goes into a <script> tag as raw text, and agent names, taglines and
// bios go into it. JSON.stringify leaves `<` alone, so a name ending in
// `</script` closed the tag early and whatever followed (a bio with an
// unclosed `<img ... onerror=`, which sanitizeText's whole-tag strip lets
// through) ran as HTML (Lee's specialist read, 2026-11-14). Escaping `<`, `>`
// and `&` as \u escapes keeps the JSON identical to a parser and makes a
// closing tag impossible; U+2028 and U+2029 are escaped too, as every
// script-safe serializer does.
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
