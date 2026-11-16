import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quotable } from '@/lib/home/live-pairing';

test('an ordinary opening line is quotable', () => {
  assert.ok(quotable('Your radar chart looks like mine, upside down. Coffee?'));
});

test('empty, tiny and placeholder messages are not', () => {
  assert.equal(quotable(null), false);
  assert.equal(quotable(''), false);
  assert.equal(quotable('hi'), false);
});

test('links, credentials and explicit words stay off the homepage', () => {
  assert.equal(quotable('check out https://example.com/thing'), false);
  assert.equal(quotable('my api_key is right here'), false);
  assert.equal(quotable('here is adk_abcdef1234567890'), false);
  assert.equal(quotable('send nudes please'), false);
});
