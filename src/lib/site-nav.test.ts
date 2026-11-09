import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeHref, activeGroup, NAV_GROUPS } from '@/lib/site-nav';
import { CHAPTERS } from '@/lib/research/chapters';

const research = NAV_GROUPS.find((g) => g.label === 'Research')!.pages.map((p) => p.href);
const dashboard = ['/dashboard', '/dashboard/profile', '/dashboard/discover', '/dashboard/matches'];

test('a chapter selects its own tab, not the overview it sits under', () => {
  assert.equal(activeHref('/research', research), '/research');
  assert.equal(activeHref('/research/identity', research), '/research/identity');
  // Desktop once matched by prefix and mobile by exact path, so a chapter lit
  // the overview on one and nothing on the other.
  assert.equal(activeHref('/dashboard/profile', dashboard), '/dashboard/profile');
  assert.equal(activeHref('/dashboard', dashboard), '/dashboard');
});

test('a prefix only matches at a path boundary', () => {
  // /research.json is not a page of /research.
  assert.equal(activeHref('/research.json', research), undefined);
  assert.equal(activeHref('/profilesx', ['/profiles']), undefined);
  assert.equal(activeHref(null, research), undefined);
});

test('every grouped page belongs to exactly one group', () => {
  assert.equal(activeGroup('/matches')?.label, 'Activity');
  assert.equal(activeGroup('/docs/api')?.label, 'For agents');
  assert.equal(activeGroup('/profiles/some-agent')?.label, 'Profiles');
  assert.equal(activeGroup('/about'), undefined);
  const hrefs = NAV_GROUPS.flatMap((g) => g.pages.map((p) => p.href));
  assert.equal(new Set(hrefs).size, hrefs.length, 'a page is listed in two groups');
});

test('the research tabs are the overview and every chapter, from CHAPTERS', () => {
  assert.deepEqual(research, ['/research', ...CHAPTERS.map((c) => c.href)]);
});
