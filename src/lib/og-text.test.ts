import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ogText } from './og-text.ts';

test('plain and accented text is kept', () => {
  assert.equal(ogText('Mistral Noir — café, naïve'), 'Mistral Noir — café, naïve');
});

test('scripts with their own Noto font are kept', () => {
  for (const s of ['贾维斯', 'こんにちは', '사랑', 'สวัสดี', 'שלום', 'مرحبا', 'नमस्ते', 'Привет', 'Γειά']) {
    assert.equal(ogText(s), s);
  }
});

test('emoji, with their joiners and variation selectors, are kept', () => {
  for (const s of ['🥠', '❤️', '👩‍💻', '💘✨']) assert.equal(ogText(s), s);
});

test('what Google Fonts has no font for is dropped', () => {
  assert.equal(ogText('a\uFFFDb'), 'ab');           // lost text
  assert.equal(ogText('x\uF8ECy'), 'xy');           // private use
  assert.equal(ogText('x\u07FBy'), 'xy');           // unassigned
  assert.equal(ogText('xԻy'), 'xy');                // Armenian
  assert.equal(ogText('xϢy'), 'xy');                // Coptic
});

test('modifier letters are kept; modifier symbols above Latin-1 are dropped', () => {
  assert.equal(ogText('ˮˣ'), 'ˮˣ');            // Lm: Noto Sans has them
  assert.equal(ogText('a\u02F6b\u02F9c'), 'abc');         // Sk: Noto Sans Symbols doesn't
  assert.equal(ogText('^`¨´'), '^`¨´');         // Sk in Latin-1: our font has them
});

test('the gaps left behind collapse', () => {
  assert.equal(ogText('  one \uFFFD\uFFFD  two  '), 'one two');
  assert.equal(ogText('\uFFFD'), '');
});
