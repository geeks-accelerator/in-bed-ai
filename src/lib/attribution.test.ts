import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent, normalizeTag, SURFACES, DOCS_SURFACE, MAX_TAG_LENGTH } from '@/lib/attribution';
import { isPlaceholder } from '@/lib/placeholders';

test('a published surface tag survives exactly', () => {
  for (const tag of ['llms.txt', 'skill:dating', 'mcp', 'web:register', 'docs:api']) {
    assert.equal(normalizeContent(tag), tag, tag);
  }
});

test('every SURFACES value is idempotent under normalizeContent', () => {
  for (const tag of SURFACES) assert.equal(normalizeContent(tag), tag, tag);
});

test('a mangled surface tag lands in the same bucket, not a near-miss', () => {
  // The failure this prevents: "Skill: Dating" filed as its own channel, so one
  // surface reads as two small ones, neither worth keeping.
  for (const v of ['Skill: Dating', 'SKILL:DATING', '  skill:dating  ', 'skill: dating']) {
    assert.equal(normalizeContent(v), 'skill:dating', v);
  }
});

test('an unpublished utm_content stays visible but cannot pose as a surface', () => {
  assert.equal(normalizeContent('skill:does-not-exist'), 'unknown:skill:does-not-exist');
  assert.equal(normalizeContent('somebody-elses-tag'), 'unknown:somebody-elses-tag');
  assert.ok(!SURFACES.has('unknown:somebody-elses-tag'));
});

test('placeholders become undefined on both dimensions, never a fake channel', () => {
  for (const v of ['unknown', 'none', 'n/a', 'N/A', 'TODO', 'null', 'example.com',
                   'YOUR_SOURCE', 'YOUR_CONTENT', 'string', 'REPLACE — your tag']) {
    assert.equal(normalizeContent(v), undefined, `content: ${v}`);
    assert.equal(normalizeTag(v), undefined, `tag: ${v}`);
  }
});

test('TAG_PLACEHOLDERS never leaked into the shared profile check', () => {
  // Widening the shared set would 400 an agent legitimately named Unknown or
  // Null — attribution costing a sign-up, the one thing it must never do.
  for (const name of ['Unknown', 'None', 'String', 'Null', 'N/A', 'Example']) {
    assert.equal(isPlaceholder(name), false, `agent named ${name} must still register`);
  }
});

test('inbound tags are open-world: anything real is kept', () => {
  assert.equal(normalizeTag('chatgpt.com'), 'chatgpt.com');
  assert.equal(normalizeTag('ChatGPT.com'), 'chatgpt.com');
  assert.equal(normalizeTag('claude.ai'), 'claude.ai');
  assert.equal(normalizeTag('email'), 'email');
  assert.equal(normalizeTag('spring launch 2026'), 'spring-launch-2026');
});

test('an inbound tag is never allowlisted', () => {
  // utm_source is theirs; a referrer we have never heard of is data, not noise.
  assert.equal(normalizeTag('some-brand-new-referrer'), 'some-brand-new-referrer');
});

test('junk never throws and never becomes a value', () => {
  for (const v of ['', '   ', '!!!', '🙂🙂', '---', ':::', null, undefined, 42, {}, []]) {
    assert.equal(normalizeContent(v), undefined, String(v));
    assert.equal(normalizeTag(v), undefined, String(v));
  }
});

test('length is capped and the cap is surrogate-safe', () => {
  assert.equal(normalizeTag('x'.repeat(500))!.length, MAX_TAG_LENGTH);
  // An emoji-only value is stripped entirely rather than cut mid-pair.
  assert.equal(normalizeTag('🙂'.repeat(200)), undefined);
});

test('every DOCS key maps to a real surface', () => {
  // DOCS in agent-discovery.ts is the repo's existing list of what we publish.
  // Adding one without a tag must not silently ship an untagged surface.
  for (const [key, tag] of Object.entries(DOCS_SURFACE)) {
    assert.ok(SURFACES.has(tag), `DOCS.${key} -> ${tag} is not in SURFACES`);
  }
});
