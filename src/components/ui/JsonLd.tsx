import { jsonLdHtml } from '@/lib/json-ld';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

// The only file in src/ that writes raw HTML into the page, and only for these
// two scripts (src/lib/json-ld.test.ts holds that).

/** The one place a page writes structured data, escaped by jsonLdHtml(). */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />;
}

/**
 * The theme boot script, inline and first in <head> so it runs before paint.
 * Takes no input: it only ever renders the THEME_BOOT_SCRIPT constant.
 */
export function ThemeBootScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />;
}
