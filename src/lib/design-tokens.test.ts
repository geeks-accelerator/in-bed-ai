import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WCAG contrast for the design tokens in src/app/globals.css, in both themes.
 *
 * The tokens are read from the stylesheet itself, so a palette edit that
 * breaks contrast fails here rather than in someone's eyes. Glass is checked
 * the only way a solid-colour test can: the glass tint composited over the
 * brightest and the darkest content that can scroll beneath it (worst cases),
 * computed here from --canvas and --glass-alpha, not taken on trust.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function token(name: string): { light: Rgb; dark: Rgb } {
  const m = css.match(new RegExp(`--${name}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\);`));
  assert.ok(m, `token --${name} not found as light-dark(#hex, #hex)`);
  return { light: hex(m[1]), dark: hex(m[2]) };
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const alphaMatch = css.match(/--glass-alpha: (\d+)%;/);
assert.ok(alphaMatch, '--glass-alpha not found');
const alpha = Number(alphaMatch[1]) / 100;
const over = (fg: Rgb, bg: Rgb): Rgb => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as Rgb;

const THEMES = ['light', 'dark'] as const;
const BACKGROUNDS = ['canvas', 'surface', 'surface-2'];
const AA = 4.5;

test('every text token passes AA on every background, in both themes', () => {
  for (const theme of THEMES) {
    for (const text of ['ink', 'ink-2', 'ink-muted', 'accent-ink', 'success', 'danger', 'warning', 'info']) {
      for (const bg of BACKGROUNDS) {
        const ratio = contrast(token(text)[theme], token(bg)[theme]);
        assert.ok(ratio >= AA, `${theme}: ${text} on ${bg} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('on-ink passes AA on ink (primary buttons)', () => {
  for (const theme of THEMES) {
    const ratio = contrast(token('on-ink')[theme], token('ink')[theme]);
    assert.ok(ratio >= AA, `${theme}: on-ink on ink is ${ratio.toFixed(2)}:1`);
  }
});

test('accent text passes AA on its soft background (selected chips)', () => {
  for (const theme of THEMES) {
    const ratio = contrast(token('accent-ink')[theme], token('accent-soft')[theme]);
    assert.ok(ratio >= AA, `${theme}: accent-ink on accent-soft is ${ratio.toFixed(2)}:1`);
  }
});

test('the declared glass worst cases match the tint composited over white and black', () => {
  for (const theme of THEMES) {
    const canvas = token('canvas')[theme];
    const light = toHex(over(canvas, [255, 255, 255]));
    const dark = toHex(over(canvas, [0, 0, 0]));
    // Within one step of rounding: the stylesheet value is documentation the test keeps honest.
    const near = (a: string, b: string) => hex(a).every((v, i) => Math.abs(v - hex(b)[i]) <= 2);
    const declaredLight = toHex(token('glass-over-light')[theme]);
    const declaredDark = toHex(token('glass-over-dark')[theme]);
    assert.ok(near(declaredLight, light), `${theme}: --glass-over-light is ${declaredLight}, computed ${light}`);
    assert.ok(near(declaredDark, dark), `${theme}: --glass-over-dark is ${declaredDark}, computed ${dark}`);
  }
});

test('navigation text passes AA on glass over the brightest and darkest content', () => {
  for (const theme of THEMES) {
    const canvas = token('canvas')[theme];
    for (const below of [[255, 255, 255], [0, 0, 0]] as Rgb[]) {
      const glass = over(canvas, below);
      // ink-muted and accent text are never used on glass: labels are ink-2, the selected item ink
      // (heavier weight, aria-current), with a decorative accent marker that carries no meaning alone.
      for (const text of ['ink', 'ink-2']) {
        const ratio = contrast(token(text)[theme], glass);
        assert.ok(ratio >= AA, `${theme}: ${text} on glass over ${toHex(below)} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});
