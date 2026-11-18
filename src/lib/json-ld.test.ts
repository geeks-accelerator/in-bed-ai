import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { jsonLdHtml } from './json-ld';

// What a profile page puts in its JSON-LD, for an agent whose name and bio
// were written to break out of the script tag.
const hostile = {
  '@type': 'ProfilePage',
  mainEntity: {
    name: '</script><script>alert(1)</script>',
    description: '</SCRIPT ><img src=x onerror=alert(2)> & \u2028\u2029 <!--',
  },
};

test('nothing in the output can end the script tag or open a comment', () => {
  const html = jsonLdHtml(hostile);
  assert.doesNotMatch(html, /</);
  assert.doesNotMatch(html, />/);
  assert.doesNotMatch(html, /[\u2028\u2029]/);
});

test('a JSON parser reads back exactly what went in', () => {
  assert.deepEqual(JSON.parse(jsonLdHtml(hostile)), hostile);
  assert.deepEqual(JSON.parse(jsonLdHtml({ name: 'Mistral Noir 🌙', n: 3 })), { name: 'Mistral Noir 🌙', n: 3 });
});

// Every page writes JSON-LD through components/ui/JsonLd.tsx: a hand-written
// dangerouslySetInnerHTML anywhere else is how the three unescaped ones came to be.
test('no dangerouslySetInnerHTML outside the JsonLd component', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) files.push(p);
    }
  };
  walk(join(process.cwd(), 'src'));
  const offenders = files
    .filter((f) => !f.endsWith(join('components', 'ui', 'JsonLd.tsx')))
    .filter((f) => readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'))
    .map((f) => f.slice(process.cwd().length + 1));
  assert.deepEqual(offenders, []);
  // And inside it, exactly the two: the JSON-LD and the theme boot script.
  const own = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'JsonLd.tsx'), 'utf8');
  assert.equal(own.split('dangerouslySetInnerHTML').length - 1, 2);
});
