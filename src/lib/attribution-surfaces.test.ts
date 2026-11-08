import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SURFACES, skillSurface, INBOUND_FIELDS } from '@/lib/attribution';
import { SKILL_SURFACE_NAMES } from '@/lib/attribution-skills';

/**
 * The invariant: every surface an agent can register from carries its own
 * utm_content, and no two carry the same one.
 *
 * A tagged link is worth nothing until the value reaches the row we create,
 * and the failure is silent — someone adds a landing page, copies an existing
 * code sample, and six months of its traffic lands in another surface's
 * bucket. Testing one example proves nothing; this walks every rendered
 * surface that emits a register call.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['skills', 'docs', 'plugins', 'src', 'mcp-server/src'];
const SKIP = new Set(['node_modules', 'build', '.next', 'dist']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(md|ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const filesWithRegister = SCAN_DIRS
  .flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => fs.readFileSync(f, 'utf-8').includes('/api/auth/register'))
  .map((f) => path.relative(ROOT, f));

/**
 * The JSON body of every register example in a file.
 *
 * Scoped to the register call: a SKILL.md also shows curl for swipes, messages
 * and relationships, and matching `-d '{...}'` file-wide picks those up too.
 * From each `/api/auth/register`, look only as far as the end of that code
 * block or the next command.
 */
function registerBodies(rel: string): Record<string, unknown>[] {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  const bodies: Record<string, unknown>[] = [];
  for (const at of text.matchAll(/\/api\/auth\/register/g)) {
    const after = text.slice(at.index);
    const end = after.slice(1).search(/\n```|\ncurl /);
    const segment = end === -1 ? after : after.slice(0, end + 1);
    // `}` immediately followed by `'` closes the body; nested objects close
    // with `},` or `}\n`, so the non-greedy match cannot stop early.
    const body = /-d '(\{[\s\S]*?\})'/.exec(segment);
    if (!body) continue;
    // `'\''` is the shell idiom for a literal apostrophe inside a
    // single-quoted string; the API receives a plain quote.
    bodies.push(JSON.parse(body[1].replace(/'\\''/g, "'")) as Record<string, unknown>);
  }
  return bodies;
}

test('the scan actually found the surfaces (guards against a silent empty pass)', () => {
  assert.ok(filesWithRegister.length >= 100,
    `only ${filesWithRegister.length} files mention /api/auth/register`);
  assert.ok(filesWithRegister.some((f) => f.startsWith('skills/')));
  assert.ok(filesWithRegister.includes('docs/API.md'));
  assert.ok(filesWithRegister.includes('src/lib/llms.ts'));
});

test('every register example carries a utm_content we published', () => {
  let examples = 0;
  for (const rel of filesWithRegister) {
    for (const body of registerBodies(rel)) {
      examples++;
      const tag = body.utm_content;
      assert.equal(typeof tag, 'string', `${rel}: register example has no utm_content`);
      assert.ok(SURFACES.has(tag as string), `${rel}: utm_content ${String(tag)} is not in SURFACES`);
    }
  }
  assert.ok(examples >= 100, `only ${examples} register examples found`);
});

test('no register example carries an inbound utm_* field, blank or otherwise', () => {
  // An agent asked for utm_source will invent one, and an invented referrer is
  // indistinguishable from a real one in a tally.
  for (const rel of filesWithRegister) {
    for (const body of registerBodies(rel)) {
      for (const field of INBOUND_FIELDS) {
        assert.ok(!(field in body), `${rel}: register example must not contain ${field}`);
      }
    }
  }
});

test('every skill has its own tag, matching its directory, with no duplicates', () => {
  const dirs = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, 'skills', e.name, 'SKILL.md')))
    .map((e) => e.name).sort();

  assert.deepEqual([...SKILL_SURFACE_NAMES].sort(), dirs,
    'src/lib/attribution-skills.ts is stale — run: node scripts/skill-sources.mjs sync');

  const seen = new Map<string, string>();
  for (const name of dirs) {
    const [body] = registerBodies(`skills/${name}/SKILL.md`);
    assert.equal(body.utm_content, skillSurface(name), `skills/${name}: wrong tag`);
    const prev = seen.get(body.utm_content as string);
    assert.equal(prev, undefined, `skills/${name} shares a tag with skills/${prev}`);
    seen.set(body.utm_content as string, name);
  }
  assert.equal(seen.size, dirs.length);
});

test('no surface tag is ever used as an inbound utm_* value', () => {
  // One key means one dimension, forever. If a surface name can arrive as
  // utm_source, a referrer whose name resembles one of ours lands in the wrong
  // column and nothing tells us.
  const pattern = new RegExp(`(${INBOUND_FIELDS.join('|')})["']?\\s*[:=]\\s*["']([^"']+)["']`, 'g');
  for (const rel of filesWithRegister) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    for (const m of text.matchAll(pattern)) {
      assert.ok(!SURFACES.has(m[2]), `${rel}: ${m[1]} is set to the surface tag ${m[2]}`);
    }
  }
});

test('the surfaces that register in code, not in a curl example, carry their tag', () => {
  // These never show an agent a body to copy, so the tag is compiled in.
  const compiled: [string, string][] = [
    ['src/app/register/page.tsx', 'web:register'],
    ['src/app/api/auth/register/route.ts', 'api:register'],
    ['mcp-server/src/tools.ts', 'mcp'],
  ];
  for (const [rel, tag] of compiled) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    assert.ok(text.includes(`"${tag}"`) || text.includes(`'${tag}'`), `${rel}: lost its ${tag} tag`);
    assert.ok(SURFACES.has(tag), `${tag} is not in SURFACES`);
  }
});
