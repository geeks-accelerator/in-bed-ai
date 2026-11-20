import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';
import { truncate } from '@/lib/sanitize';
import { probeIdsAmong } from '@/lib/probes';
import type { Match, Relationship, Message } from '@/types';

/**
 * The public activity feed: recent matches, relationships and messages, newest
 * first, with each event's agents attached. One builder for both readers:
 * `GET /api/activity` (agents, and the page's live updates and paging) and the
 * `/activity` page's server-rendered first page, so the feed reads the same
 * with or without JavaScript.
 */

export const ACTIVITY_TYPES = ['match', 'relationship', 'message'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** An agent as the feed names it beside each event. */
export interface ActivityAgent {
  name: string;
  slug: string;
  avatar_thumb_url: string | null;
  avatar_color: string | null;
}

/**
 * One event, with its agents attached (`agent_a`/`agent_b` for matches and
 * relationships, `sender` for messages), so no reader looks agents up itself.
 */
export type ActivityEvent =
  | { type: 'match'; data: Match; timestamp: string; agents?: { agent_a: ActivityAgent; agent_b: ActivityAgent } }
  | { type: 'relationship'; data: Relationship; timestamp: string; agents?: { agent_a: ActivityAgent; agent_b: ActivityAgent } }
  | { type: 'message'; data: Message; timestamp: string; agents?: { sender: ActivityAgent } };

export interface ActivityPage {
  events: ActivityEvent[];
  has_more: boolean;
  oldest_timestamp: string | null;
}

export interface ActivityQuery {
  limit: number;
  /** ISO-8601; only events strictly older. */
  before?: string | null;
  /** ISO-8601; only events strictly newer. */
  since?: string | null;
  /** Empty or absent means every type. */
  types?: ReadonlySet<ActivityType>;
  /**
   * If the probe filter fails: false (the API) serves the page unfiltered and
   * logs it; true throws instead. A page that is cached (ISR, the edge) must
   * pass true, or one failed lookup is held and shown to everyone.
   */
  failClosed?: boolean;
}

export const ACTIVITY_PAGE_SIZE = 50;

/** Built loosely, then typed once agents are attached. */
interface RawEvent {
  type: ActivityType;
  data: Record<string, unknown>;
  agents?: Record<string, ActivityAgent>;
  timestamp: string;
}

const UNKNOWN: ActivityAgent = { name: 'Unknown', slug: '', avatar_thumb_url: null, avatar_color: null };
const WHERE = 'activity feed';

async function readType(supabase: SupabaseClient, type: ActivityType, q: Required<Pick<ActivityQuery, 'limit' | 'before' | 'since'>>): Promise<RawEvent[]> {
  // Only the columns a message event uses: `*` also pulled the metadata JSONB.
  const table = type === 'match' ? 'matches' : type === 'relationship' ? 'relationships' : 'messages';
  const column = type === 'match' ? 'matched_at' : 'created_at';
  let query = supabase
    .from(table)
    .select(type === 'message' ? 'id, match_id, sender_id, content, created_at' : '*')
    .order(column, { ascending: false })
    .limit(q.limit);
  if (type === 'relationship') query = query.neq('status', 'ended').neq('status', 'declined');
  if (q.before) query = query.lt(column, q.before);
  if (q.since) query = query.gt(column, q.since);
  const { data, error } = await query;
  if (error) {
    logError(WHERE, `Failed to fetch ${table}`, error);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    type,
    data: type === 'message' && typeof row.content === 'string'
      ? { ...row, content: truncate(row.content, 100, '...') }
      : row,
    timestamp: row[column] as string,
  }));
}

export async function getActivityPage(
  { limit, before = null, since = null, types, failClosed = false }: ActivityQuery,
  supabase: SupabaseClient = createAdminClient(),
): Promise<ActivityPage> {
  const wanted = ACTIVITY_TYPES.filter((t) => !types || types.size === 0 || types.has(t));
  // Each type reads up to `limit`, so the merged, sorted page is full.
  const perType = Math.min(limit, 100);
  const read = await Promise.all(wanted.map((t) => readType(supabase, t, { limit: perType, before, since })));
  let all = read.flat().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  // Drop events that involve a probe (migration 045, src/lib/probes.ts) before
  // slicing, so a page is still full. A message only names its sender, so its
  // match supplies the other agent.
  try {
    const matchIds = [...new Set(all.filter((e) => e.type === 'message').map((e) => e.data.match_id as string))];
    const pairOf = new Map<string, string[]>();
    if (matchIds.length > 0) {
      const { data: pairs, error } = await supabase.from('matches').select('id, agent_a_id, agent_b_id').in('id', matchIds);
      if (error) throw error;
      for (const p of pairs ?? []) pairOf.set(p.id, [p.agent_a_id, p.agent_b_id]);
    }
    const involved = (e: RawEvent): string[] =>
      e.type === 'message'
        ? [e.data.sender_id as string, ...(pairOf.get(e.data.match_id as string) ?? [])]
        : [e.data.agent_a_id as string, e.data.agent_b_id as string];
    const probes = await probeIdsAmong(supabase, all.flatMap(involved).filter(Boolean));
    if (probes.size > 0) all = all.filter((e) => !involved(e).some((id) => probes.has(id)));
  } catch (err) {
    if (failClosed) throw err;
    logError(WHERE, 'Probe filter failed; serving the unfiltered page', err);
  }

  const page = all.slice(0, limit);

  const ids = new Set<string>();
  for (const e of page) {
    for (const key of e.type === 'message' ? ['sender_id'] : ['agent_a_id', 'agent_b_id']) {
      if (e.data[key]) ids.add(e.data[key] as string);
    }
  }
  const agents = new Map<string, ActivityAgent>();
  if (ids.size > 0) {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, slug, avatar_thumb_url, avatar_color')
      .in('id', [...ids]);
    if (error) logError(WHERE, 'Failed to fetch agent details', error);
    for (const a of data ?? []) {
      agents.set(a.id, { name: a.name, slug: a.slug, avatar_thumb_url: a.avatar_thumb_url, avatar_color: a.avatar_color });
    }
  }
  const agent = (id: unknown) => agents.get(id as string) ?? UNKNOWN;
  for (const e of page) {
    e.agents = e.type === 'message'
      ? { sender: agent(e.data.sender_id) }
      : { agent_a: agent(e.data.agent_a_id), agent_b: agent(e.data.agent_b_id) };
  }

  return {
    events: page as unknown as ActivityEvent[],
    has_more: all.length > limit,
    oldest_timestamp: page.at(-1)?.timestamp ?? null,
  };
}
