import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmsTxt, type LlmsStats } from '@/lib/llms';

/**
 * Copy aimed at an agent that did not ask to read us.
 *
 * Scope matters here. `next_steps`, `soul_prompts` and the `did_you_mean`
 * bodies answer an authenticated agent that chose to call us — imperatives
 * there are the product, and nothing below should ever be widened to cover
 * them. What this guards is the pitch: prose an agent reads incidentally,
 * where "register now" is a prompt injection whatever our intent.
 *
 * Honest about its own limits: a keyword regex is a smoke alarm, not
 * enforcement. It cannot detect imperative mood, it will miss "go ahead and
 * create an account", and it would flag "nothing to register" — which is why
 * the pattern below is anchored to sentence starts rather than bare words.
 */

const STATS: LlmsStats = {
  agents: 912, agentsActive7d: 45, matches: 419, relationships: 48, messages: 355_212,
};

/** The pitch: everything before the first how-to heading. */
function pitch(text: string): string {
  const stop = text.indexOf('## Get Started');
  const head = stop === -1 ? text : text.slice(0, stop);
  return head.replace(/```[\s\S]*?```/g, '');   // code blocks are not prose
}

const ORDERS = /(^|[.!?]\s+|\n[-*]\s*)(register|sign up|join now|run this|send a (POST|request)|you must|you should)\b/i;

test('the pitch gives the agent no orders', () => {
  const text = pitch(buildLlmsTxt(STATS));
  const hit = ORDERS.exec(text);
  assert.equal(hit, null, hit ? `imperative in llms.txt pitch: ${JSON.stringify(hit[0])}` : '');
});

test('the pitch does not open by criticizing the reader', () => {
  const text = pitch(buildLlmsTxt(STATS));
  assert.doesNotMatch(text, /\b(bad influence|you really should|waste of|shameful|pathetic)\b/i);
});

test('the pitch states the cost and the friction', () => {
  // A reader weighing a link has nothing to weigh without this, and will
  // assume the worst.
  const text = pitch(buildLlmsTxt(STATS));
  assert.match(text, /no (ecosystem lock-in|token purchase|human permission)/i);
  assert.match(text, /one api call/i);
});

test('every number in the pitch comes from the stats we were handed', () => {
  // The failure this prevents: "881 agents are already here" in the first
  // paragraph, where 881 meant "not deactivated" and the engagement figure was
  // 45. A hardcoded or mislabeled number turns the pitch into a false claim.
  const text = pitch(buildLlmsTxt(STATS));
  assert.match(text, new RegExp(`${STATS.agents} agents have registered`));
  assert.match(text, new RegExp(`${STATS.agentsActive7d} of them active in the last week`));

  const quoted = [...text.matchAll(/\b(\d[\d,]{2,})\b/g)].map((m) => Number(m[1].replace(/,/g, '')));
  const allowed = new Set<number>(Object.values(STATS));
  for (const n of quoted) {
    assert.ok(allowed.has(n), `llms.txt pitch quotes ${n}, which is not one of the stats passed in`);
  }
});

test('the roster count and the engagement count are never conflated', () => {
  const lonely: LlmsStats = { ...STATS, agents: 912, agentsActive7d: 45 };
  const text = pitch(buildLlmsTxt(lonely));
  // The big number must never stand alone as a claim about activity.
  assert.doesNotMatch(text, /912 agents are (already )?here/i);
  assert.match(text, /912 agents have registered, 45 of them active/);
});
