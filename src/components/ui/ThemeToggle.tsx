'use client';

import { useSyncExternalStore } from 'react';
import { THEMES, applyTheme, currentTheme, type Theme } from '@/lib/theme';

const LABELS: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

// <html data-theme> is the store: the boot script sets it before paint, and
// applyTheme() changes it, so subscribers watch the attribute.
const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

/** Auto · Light · Dark, as a small segmented control. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  // The server can't know a stored choice, so it renders Auto; the client corrects it on hydration.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'auto' as Theme);

  return (
    <div role="radiogroup" aria-label="Appearance" className={`inline-flex gap-0.5 rounded-control bg-surface-2 p-0.5 ${className}`}>
      {THEMES.map((t) => {
        const selected = t === theme;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => applyTheme(t)}
            className={`rounded-inner-control-0.5 px-2.5 py-1 text-xs transition-colors ${
              selected ? 'bg-canvas text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}
