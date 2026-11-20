import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActivityPage } from '@/lib/activity';

/**
 * getActivityPage's two failure paths. The API fails open (an unfiltered page,
 * logged), the cached /activity page fails closed (no page, so nothing
 * unfiltered is held), and a probe's events never reach a filtered page.
 */

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const PROBE = 'c0000000-0000-4000-8000-000000000003';

const MATCHES = [
  { id: 'm1', agent_a_id: A, agent_b_id: B, matched_at: '2026-11-20T10:00:00+00:00' },
  { id: 'm2', agent_a_id: A, agent_b_id: PROBE, matched_at: '2026-11-20T09:00:00+00:00' },
];

/** A query builder that answers by table, and fails the probe lookup when asked. */
function stub({ probeLookupFails }: { probeLookupFails: boolean }): SupabaseClient {
  return {
    from(table: string) {
      let probeLookup = false;
      const builder = {
        select: () => builder, order: () => builder, limit: () => builder, neq: () => builder,
        lt: () => builder, gt: () => builder, in: () => builder,
        eq(column: string) {
          if (column === 'listable') probeLookup = true;
          return builder;
        },
        then(resolve: (r: { data: unknown; error: unknown }) => void) {
          if (table === 'matches') return resolve({ data: MATCHES, error: null });
          if (table === 'agents' && probeLookup) {
            return resolve(probeLookupFails
              ? { data: null, error: { message: 'probe lookup down' } }
              : { data: [{ id: PROBE }], error: null });
          }
          if (table === 'agents') {
            return resolve({ data: [A, B, PROBE].map((id) => ({ id, name: id.slice(0, 1), slug: id.slice(0, 1), avatar_thumb_url: null, avatar_color: null })), error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

test('a probe\'s events are dropped, and its partners named', async () => {
  const page = await getActivityPage({ limit: 10 }, stub({ probeLookupFails: false }));
  assert.deepEqual(page.events.map((e) => e.data.id), ['m1']);
  assert.equal(page.has_more, false);
  assert.equal(page.oldest_timestamp, MATCHES[0].matched_at);
  const first = page.events[0];
  assert.ok(first.type === 'match' && first.agents?.agent_a.slug === 'a');
});

test('the API fails open: a failed probe lookup serves the unfiltered page', async () => {
  const page = await getActivityPage({ limit: 10 }, stub({ probeLookupFails: true }));
  assert.deepEqual(page.events.map((e) => e.data.id), ['m1', 'm2']);
});

test('a cached page fails closed: a failed probe lookup throws', async () => {
  await assert.rejects(
    getActivityPage({ limit: 10, failClosed: true }, stub({ probeLookupFails: true })),
    { message: 'probe lookup down' },
  );
});
