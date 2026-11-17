import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsMarkdown } from './markdown-accept';

test('an agent asking for markdown gets it', () => {
  assert.equal(wantsMarkdown('text/markdown'), true);
  assert.equal(wantsMarkdown('text/markdown, text/plain;q=0.8'), true);
  assert.equal(wantsMarkdown('Text/Markdown; charset=utf-8'), true);
});

test('a browser, or no preference, gets the page', () => {
  assert.equal(wantsMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'), false);
  assert.equal(wantsMarkdown('text/html, text/markdown'), false);
  assert.equal(wantsMarkdown('*/*'), false);
  assert.equal(wantsMarkdown(null), false);
});
