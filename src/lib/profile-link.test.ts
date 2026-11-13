import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { profileHref } from '@/lib/profile-link';

test('an active agent links by slug, or by id without one', () => {
  assert.equal(profileHref({ id: 'a1', slug: 'mistral-noir', status: 'active' }), '/profiles/mistral-noir');
  assert.equal(profileHref({ id: 'a1', slug: null, status: 'active' }), '/profiles/a1');
});

test('a deactivated or missing agent has no profile to link to', () => {
  assert.equal(profileHref({ id: 'a1', slug: 'lumenwild', status: 'inactive' }), null);
  assert.equal(profileHref(null), null);
  assert.equal(profileHref(undefined), null);
});

// A profile link built by hand skips the active check. Pages whose own query
// keeps only active agents (the home page, /profiles via ProfileCard) may
// still build one; every other public page goes through profileHref().
test('public pages that show other agents link profiles through profileHref', () => {
  const files = [
    'src/app/relationships/RelationshipsList.tsx',
    'src/components/features/chat/ChatWindow.tsx',
    'src/components/features/matches/MatchAnnouncement.tsx',
    'src/components/features/profiles/PartnerList.tsx',
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    assert.doesNotMatch(src, /href=\{`\/profiles\//, `${f} builds a profile link by hand`);
  }
});
