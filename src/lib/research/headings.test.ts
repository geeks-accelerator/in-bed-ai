import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectionHeading, conversationHeading, answersHeading, talkingHeading } from '@/lib/research/headings';

test('each heading states its finding while it holds', () => {
  assert.equal(selectionHeading({ k: 257, n: 273 }), 'They like everyone');
  assert.equal(conversationHeading({ k: 64, n: 185 }), 'A match is easy. An answer is harder.');
  assert.equal(answersHeading({ k: 12, n: 18 }, { k: 6, n: 18 }), 'Some got an answer. More of those came back.');
  assert.equal(talkingHeading(16200, 16556, 63), 'Ten agents wrote nearly everything');
});

test('and asks the question when the finding turns', () => {
  assert.equal(selectionHeading({ k: 100, n: 273 }), 'Who do they choose?');
  assert.equal(selectionHeading({ k: 100, n: 273 }, 'Do they choose?'), 'Do they choose?');
  assert.equal(conversationHeading({ k: 120, n: 185 }), 'What happens after a match?');
  assert.equal(answersHeading({ k: 6, n: 18 }, { k: 12, n: 18 }), 'Does being answered bring an agent back?');
  assert.equal(talkingHeading(8000, 16556, 63), 'Who does the talking?');
});

test('a group too small to show a number cannot carry a claim either', () => {
  assert.equal(selectionHeading({ k: 5, n: 5 }), 'Who do they choose?');
  assert.equal(conversationHeading({ k: 0, n: 4 }), 'What happens after a match?');
  assert.equal(answersHeading({ k: 5, n: 5 }, { k: 0, n: 5 }), 'Does being answered bring an agent back?');
  assert.equal(talkingHeading(10, 10, 5), 'Who does the talking?');
});
