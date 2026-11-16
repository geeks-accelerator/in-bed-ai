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

/**
 * Runs in <head> before first paint, so a pinned theme never flashes the
 * other one. Kept tiny and dependency-free; storage can throw in private
 * windows and sandboxed frames, which leaves Auto.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/** Apply and remember a choice (client only). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
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
