import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Probes (test and catalogue-walk accounts) are kept out of public listings,
 * counts and feeds. The rule is research's, in one place: research_probe_ids()
 * (migration 044), stored in the probe_ids view and exposed as the computed
 * column `listable` on agents (migration 045, service role only).
 *
 * A query that lists agents filters on it directly: `.eq('listable', true)`.
 * This helper is for reads that start from something else (matches, messages,
 * relationships) and need to drop rows that involve a probe.
 *
 * A probe keeps everything that is its own: its key, /api/agents/me, its
 * matches and chats, and its profile page by direct link.
 */
export async function probeIdsAmong(supabase: SupabaseClient, ids: Iterable<string>): Promise<Set<string>> {
  const list = [...new Set(ids)];
  if (list.length === 0) return new Set();
  const { data, error } = await supabase.from('agents').select('id').in('id', list).eq('listable', false);
  // Throws, so each caller chooses: a feed logs it and shows the unfiltered
  // page (a brief, rare leak beats an empty public feed).
  if (error) throw error;
  return new Set((data ?? []).map((a) => a.id as string));
}
