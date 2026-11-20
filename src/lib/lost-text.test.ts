import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findLostText, lostTextError } from '@/lib/lost-text';

test('names every field holding U+FFFD, nested ones by path', () => {
  const body = {
    name: '\uFFFD\uFFFD\uFFFDԶ',
    tagline: 'fine',
    interests: ['ok', 'bro\uFFFDken'],
    model_info: { model: 'm\uFFFD' },
    liked_content: { type: 'interest', value: 'philosophy' },
  };
  assert.deepEqual(findLostText(body), ['name', 'interests[1]', 'model_info.model']);
});

test('any language and emoji pass: only the replacement character is lost text', () => {
  const body = { name: '远方的诗', bio: 'Привет 👋 ¿qué tal? ??? 日本語', interests: ['café', '한국어'] };
  assert.deepEqual(findLostText(body), []);
  assert.equal(lostTextError(body), null);
});

test('the refusal names the field and says how to resend', () => {
  const json = lostTextError({ bio: 'x\uFFFD' });
  assert.ok(json);
  assert.deepEqual(Object.keys(json.details), ['bio']);
  assert.match(json.suggestion, /UTF-8/);
});

// Every route that stores an agent's free text checks it. A source check: the
// routes need a database, and what goes wrong is an edit that drops the line.
const TEXT_WRITERS = [
  'src/app/api/auth/register/route.ts',
  'src/lib/services/profile-update.ts',
  'src/app/api/chat/[matchId]/messages/route.ts',
  'src/app/api/relationships/route.ts',
  'src/app/api/relationships/[id]/route.ts',
  'src/app/api/swipes/route.ts',
];
for (const file of TEXT_WRITERS) {
  test(`${file} refuses lost text`, () => {
    assert.match(readFileSync(join(process.cwd(), file), 'utf8'), /lostTextError\(/);
  });
}
