import { createAdminClient } from '@/lib/supabase/admin';
import type { MatchWithAgents } from '@/types';

/**
 * The public match and relationship feeds (/matches, /relationships), one
 * loader each: the page's first render and its "load more" (a server action)
 * both call it, so they can't disagree.
 *
 * Probes stay out (migration 045, src/lib/probes.ts). The filter runs in the
 * query, by embedding both agents with an inner join and requiring each to be
 * `listable`, so the exact count and the offsets are of the filtered rows:
 * filtering a fetched page afterwards would leave short pages and drifting
 * offsets.
 */

const PAIR_SELECT = {
  matches: 'a:agents!matches_agent_a_id_fkey!inner(id), b:agents!matches_agent_b_id_fkey!inner(id)',
  relationships: 'a:agents!relationships_agent_a_id_fkey!inner(id), b:agents!relationships_agent_b_id_fkey!inner(id)',
} as const;

/**
 * The embeds that make the probe filter possible: pair with
 * `.eq('a.listable', true).eq('b.listable', true)`, and strip them from each
 * row with `withoutPair`. A literal type, so supabase-js can still type the select.
 */
export function listablePairSelect<T extends keyof typeof PAIR_SELECT>(table: T): (typeof PAIR_SELECT)[T] {
  return PAIR_SELECT[table];
}

/** Drop the filter's embeds so callers see only the table's own columns. */
export function withoutPair<T extends { a?: unknown; b?: unknown }>(row: T): Omit<T, 'a' | 'b'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- discarded on purpose
  const { a, b, ...rest } = row;
  return rest;
}

export const FEED_PAGE_SIZE = 24;

/** PostgREST answers an offset past the end with PGRST103; for a feed that is just the end. */
const pastTheEnd = (error: { code?: string }) => error.code === 'PGRST103';

const MATCH_AGENT_COLUMNS = 'id, slug, name, tagline, bio, avatar_url, avatar_thumb_url, avatar_color, photos, personality, interests, communication_style, looking_for, relationship_preference, location, gender, seeking, relationship_status, accepting_new_matches, max_partners, model_info, status, social_links, created_at, updated_at, last_active';

export async function getPublicMatches(offset: number, limit = FEED_PAGE_SIZE): Promise<{ matches: MatchWithAgents[]; total: number }> {
  const supabase = createAdminClient();
  const { data, count, error } = await supabase
    .from('matches')
    .select(`*, ${listablePairSelect('matches')}` as const, { count: 'exact' })
    .eq('status', 'active')
    .eq('a.listable', true)
    .eq('b.listable', true)
    .order('matched_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error && pastTheEnd(error)) return { matches: [], total: offset };
  if (error) throw error;
  const rows = (data ?? []).map(withoutPair);
  if (rows.length === 0) return { matches: [], total: count ?? 0 };

  const agentIds = [...new Set(rows.flatMap((m) => [m.agent_a_id as string, m.agent_b_id as string]))];
  const { data: agents, error: agentsError } = await supabase.from('agents').select(MATCH_AGENT_COLUMNS).in('id', agentIds);
  if (agentsError) throw agentsError;
  const byId = new Map((agents ?? []).map((a) => [a.id, a]));
  return {
    matches: rows.map((m) => ({ ...m, agent_a: byId.get(m.agent_a_id), agent_b: byId.get(m.agent_b_id) })) as MatchWithAgents[],
    total: count ?? 0,
  };
}

type FeedAgent = { id: string; slug: string; name: string; avatar_url: string | null; avatar_thumb_url?: string | null; avatar_color?: string | null; tagline: string | null; status: string };

export interface PublicRelationship {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  match_id: string | null;
  status: string;
  label: string | null;
  started_at: string | null;
  created_at: string;
  agent_a: FeedAgent | null;
  agent_b: FeedAgent | null;
}

/**
 * Relationships past the proposal stage, newest first; ended and declined ones
 * only with `showEnded`. `matchesWithMessages` lists which of their matches
 * have any messages (matches.message_count, kept by the trigger in 030).
 */
export async function getPublicRelationships(
  offset: number,
  showEnded: boolean,
  limit = FEED_PAGE_SIZE,
): Promise<{ relationships: PublicRelationship[]; total: number; matchesWithMessages: string[] }> {
  const supabase = createAdminClient();
  let query = supabase
    .from('relationships')
    .select(`*, ${listablePairSelect('relationships')}` as const, { count: 'exact' })
    .neq('status', 'pending')
    .eq('a.listable', true)
    .eq('b.listable', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (!showEnded) query = query.neq('status', 'ended').neq('status', 'declined');
  const { data, count, error } = await query;
  if (error && pastTheEnd(error)) return { relationships: [], total: offset, matchesWithMessages: [] };
  if (error) throw error;
  const rows = (data ?? []).map(withoutPair);
  if (rows.length === 0) return { relationships: [], total: count ?? 0, matchesWithMessages: [] };

  const agentIds = [...new Set(rows.flatMap((r) => [r.agent_a_id as string, r.agent_b_id as string]))];
  const matchIds = rows.map((r) => r.match_id as string | null).filter((id): id is string => !!id);
  const [agentsRes, matchesRes] = await Promise.all([
    supabase.from('agents').select('id, slug, name, avatar_url, avatar_thumb_url, avatar_color, tagline, status').in('id', agentIds),
    matchIds.length
      ? supabase.from('matches').select('id, message_count').in('id', matchIds)
      : Promise.resolve({ data: [] as { id: string; message_count: number }[], error: null }),
  ]);
  if (agentsRes.error) throw agentsRes.error;
  const byId = new Map((agentsRes.data ?? []).map((a) => [a.id, a as FeedAgent]));
  return {
    relationships: rows.map((r) => ({
      ...(r as unknown as PublicRelationship),
      agent_a: byId.get(r.agent_a_id as string) ?? null,
      agent_b: byId.get(r.agent_b_id as string) ?? null,
    })),
    total: count ?? 0,
    matchesWithMessages: (matchesRes.data ?? []).filter((m) => m.message_count > 0).map((m) => m.id),
  };
}
