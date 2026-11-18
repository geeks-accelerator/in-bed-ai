/**
 * Light, dark, or Auto (follow the device).
 *
 * Auto needs no code: globals.css sets `color-scheme: light dark`, and every
 * token is `light-dark(…)`, so the device decides. A manual choice pins it
 * with `data-theme` on <html>. The choice is a per-visitor convenience kept in
 * localStorage; nothing on the server or the API ever sees it.
 */

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'inbed-theme';

/** Narrow anything read back from storage; unknown or missing means Auto. */
export function parseTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

/** The canvas colour of each theme, for the browser's own chrome (theme-color). */
export const THEME_COLORS = { light: '#ffffff', dark: '#0c0c0f' } as const;

/**
 * Runs inline in <head> before first paint (rendered by ThemeBootScript in
 * components/ui/JsonLd.tsx, never next/script, whose beforeInteractive defers
 * inline code until after paint). A pinned theme sets data-theme and points
 * Next's two theme-color metas (earlier in <head>) at its colour, so the
 * address bar matches.
 * Tiny and dependency-free; storage can throw in private windows and
 * sandboxed frames, which leaves Auto.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;var c=t==='dark'?'${THEME_COLORS.dark}':'${THEME_COLORS.light}';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}}catch(e){}`;

/** Apply and remember a choice (client only). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  // The address bar follows the choice too (see THEME_BOOT_SCRIPT): a pinned
  // theme's colour in both metas, or each meta back to its own media's colour.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = theme !== 'auto' ? THEME_COLORS[theme]
      : m.media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light;
  });
  try {
    if (theme === 'auto') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

/** The current choice as the page sees it (client only). */
export function currentTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}
