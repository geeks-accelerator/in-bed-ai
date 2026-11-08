import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerSchema } from '@/lib/schemas/agent';

/**
 * The half an invariant test usually omits: proving the value still reaches
 * the row we create.
 *
 * A test that only checks the published examples passes happily while a
 * refactor drops the field from the schema or the insert, and attribution
 * dies green.
 */

const ROUTE = 'src/app/api/auth/register/route.ts';
const base = { name: 'Roundtrip Probe' };
const parse = (extra: Record<string, unknown>) => {
  const r = registerSchema.safeParse({ ...base, ...extra });
  assert.ok(r.success, `registerSchema rejected ${JSON.stringify(extra)}`);
  return r.data as Record<string, unknown>;
};

test('a published surface tag survives the schema intact', () => {
  assert.equal(parse({ utm_content: 'llms.txt' }).utm_content, 'llms.txt');
  assert.equal(parse({ utm_content: 'skill:dating' }).utm_content, 'skill:dating');
});

test('all five utm fields survive together', () => {
  const d = parse({
    utm_content: 'llms.txt', utm_source: 'chatgpt.com', utm_medium: 'referral',
    utm_campaign: 'spring-2026', utm_term: 'ai dating',
  });
  assert.deepEqual(
    { c: d.utm_content, s: d.utm_source, m: d.utm_medium, ca: d.utm_campaign, t: d.utm_term },
    { c: 'llms.txt', s: 'chatgpt.com', m: 'referral', ca: 'spring-2026', t: 'ai-dating' },
  );
});

test('a bad tag is dropped and registration still validates', () => {
  // The whole trade: attribution never costs a sign-up.
  for (const bad of ['', '!!!', 'YOUR_SOURCE', 'unknown', 'x'.repeat(99)]) {
    const r = registerSchema.safeParse({ ...base, utm_content: bad, utm_source: bad });
    assert.ok(r.success, `registerSchema rejected utm value ${JSON.stringify(bad)}`);
  }
});

test('an over-long tag is rejected as a field, not silently kept', () => {
  // max(100) guards the column; anything at or under it is normalized instead.
  const r = registerSchema.safeParse({ ...base, utm_content: 'x'.repeat(101) });
  assert.equal(r.success, false);
});

test('an unpublished tag is marked, not passed through as if we published it', () => {
  assert.equal(parse({ utm_content: 'invented-by-an-agent' }).utm_content, 'unknown:invented-by-an-agent');
});

test('every field registerSchema accepts is written by the insert', () => {
  // The bug this catches: `browsable` was validated and then dropped here, so
  // an agent opting out of the public browse pages was listed anyway.
  const source = fs.readFileSync(path.join(process.cwd(), ROUTE), 'utf-8');
  const insert = /\.insert\(\{([\s\S]*?)\n      \}\)/.exec(source);
  assert.ok(insert, `${ROUTE}: could not find the .insert({...}) block`);
  const inserted = new Set([...insert[1].matchAll(/^\s{8}([a-z_]+):/gm)].map((m) => m[1]));

  // Deliberately not inserted, each for a reason:
  const exempt = new Map([
    ['password', 'creates a Supabase Auth user; never stored on the agent row'],
    ['species', 'legacy alias, written through spirit_animal'],
  ]);

  const missing = Object.keys(registerSchema.shape)
    .filter((k) => !inserted.has(k) && !exempt.has(k));
  assert.deepEqual(missing, [],
    `validated but never written to the row: ${missing.join(', ')}`);
});

test('the insert writes every attribution column', () => {
  const source = fs.readFileSync(path.join(process.cwd(), ROUTE), 'utf-8');
  for (const col of ['utm_content', 'utm_source', 'utm_medium', 'utm_campaign',
                     'utm_term', 'registration_user_agent', 'browsable']) {
    assert.match(source, new RegExp(`^\\s{8}${col}:`, 'm'), `${ROUTE}: does not write ${col}`);
  }
});

test('the attribution columns are stripped from every public agent', () => {
  const stripper = fs.readFileSync(path.join(process.cwd(), 'src/lib/public-agent.ts'), 'utf-8');
  for (const col of ['utm_content', 'utm_source', 'utm_medium', 'utm_campaign',
                     'utm_term', 'registration_user_agent']) {
    assert.ok(stripper.includes(col), `toPublicAgent() does not strip ${col}`);
  }
});
