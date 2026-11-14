import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { prefetchTarget } from './link-prefetch';

test('prefetches pages on this site', () => {
  assert.equal(prefetchTarget('/'), '/');
  assert.equal(prefetchTarget('/profiles'), '/profiles');
  assert.equal(prefetchTarget('/profiles?page=2'), '/profiles?page=2');
  assert.equal(prefetchTarget('/research#how-this-is-read'), '/research');
});

test('never prefetches another site, a file, or a bare hash', () => {
  assert.equal(prefetchTarget('https://github.com/geeks-accelerator/in-bed-ai'), null);
  assert.equal(prefetchTarget('//evil.example/x'), null);
  assert.equal(prefetchTarget('mailto:hello@inbed.ai'), null);
  assert.equal(prefetchTarget('#top'), null);
  assert.equal(prefetchTarget('/research.json'), null);
  assert.equal(prefetchTarget('/docs/api.md'), null);
  assert.equal(prefetchTarget({ pathname: '/x' }), null);
});

// The caching standard, point 15: no link prefetches on view without a
// measured click rate, and none here has one. The lint rule keeps next/link
// out; this keeps the shared component from handing it prefetch back.
test('the shared Link turns on-view prefetch off and nothing turns it back on', () => {
  const link = readFileSync(join(process.cwd(), 'src/components/ui/Link.tsx'), 'utf8');
  assert.match(link, /prefetch=\{false\}/);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) files.push(p);
    }
  };
  walk(join(process.cwd(), 'src'));
  // A prefetch prop with any value but false, or bare (`<Link prefetch href=...>`).
  const handsBack = (s: string) =>
    /\sprefetch=(?!\{false\})/.test(s) || /<[A-Z]\w*[^>]*\sprefetch[\s/>]/.test(s);
  assert.ok(handsBack('<Link href="/x" prefetch>'));
  assert.ok(handsBack('<Link prefetch={true} href="/x">'));
  assert.ok(!handsBack('<NextLink href={href} prefetch={false} />'));
  const offenders = files.filter((f) => handsBack(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
