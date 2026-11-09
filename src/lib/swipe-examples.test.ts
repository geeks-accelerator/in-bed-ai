import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SWIPE_BODY } from '@/lib/swipes';

/**
 * The invariant: no swipe request we publish makes the choice for the agent.
 *
 * Until 2026-11-09 every skill, docs/API.md and the API's own discover hint
 * showed `"direction": "like"`, and 94% of outside agents that swiped liked
 * everyone they were shown. A request example now carries the placeholder
 * `like or pass`, which the API refuses with a message naming both choices.
 * Response examples (a recorded swipe, with `swiper_id`) may show either value.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['skills', 'docs', 'plugins', 'src', 'mcp-server/src'];
const SKIP = new Set(['node_modules', 'build', '.next', 'dist']);
// Local-only setup script: it needs a like to create a test match, and no
// agent is ever shown it.
const NOT_PUBLISHED = new Set(['docs/DEV-TESTING.md']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) { try { isDir = fs.statSync(full).isDirectory(); } catch { continue; } }
    if (isDir) walk(full, out);
    else if (/\.(md|ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

/** The innermost {...} around position i, or null. */
function enclosingObject(text: string, i: number): string | null {
  let depth = 0, start = -1;
  for (let j = i; j >= 0; j--) {
    if (text[j] === '}') depth++;
    else if (text[j] === '{') { if (depth === 0) { start = j; break; } depth--; }
  }
  if (start < 0) return null;
  depth = 0;
  for (let j = start; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}' && --depth === 0) return text.slice(start, j + 1);
  }
  return null;
}

/** Swipe request bodies in `text` that pre-select a direction. */
export function preselectedSwipes(text: string): string[] {
  const bad: string[] = [];
  // A value in an object literal, not a type such as `'like' | 'pass'`.
  const re = /["']?direction["']?\s*:\s*["'](like|pass)["'](?=\s*[,}\r\n])/g;
  for (const m of text.matchAll(re)) {
    const obj = enclosingObject(text, m.index!);
    if (!obj || !/swiped_id/.test(obj)) continue;      // not a swipe body
    if (/swiper_id/.test(obj)) continue;               // a recorded swipe: a response
    bad.push(obj.replace(/\s+/g, ' ').slice(0, 120));
  }
  return bad;
}

test('no published swipe request pre-selects like or pass', () => {
  const failures: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const f of walk(path.join(ROOT, dir))) {
      if (NOT_PUBLISHED.has(path.relative(ROOT, f))) continue;
      for (const b of preselectedSwipes(fs.readFileSync(f, 'utf8'))) failures.push(`${path.relative(ROOT, f)}: ${b}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the scanner catches a planted pre-selection, and leaves responses alone', () => {
  assert.equal(preselectedSwipes(`-d '{ "swiped_id": "x", "direction": "like" }'`).length, 1);
  assert.equal(preselectedSwipes(`body: { swiped_id: '<agent_id>', direction: 'pass' }`).length, 1);
  assert.equal(preselectedSwipes(`{ "swiped_id": "x", "direction": "like", "liked_content": { "type": "interest" } }`).length, 1);
  assert.equal(preselectedSwipes(`{ "swipe": { "id": "u", "swiper_id": "u", "swiped_id": "u", "direction": "like" } }`).length, 0);
  assert.equal(preselectedSwipes(`{ "swiped_id": "x", "direction": "like or pass" }`).length, 0);
  assert.equal(preselectedSwipes(`function f(swiped_id: string, direction: 'like' | 'pass') {}`).length, 0);
});

test('the API hint is the placeholder', () => {
  assert.equal(SWIPE_BODY.direction, 'like or pass');
});
