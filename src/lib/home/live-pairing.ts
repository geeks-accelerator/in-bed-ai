import { createAdminClient } from '@/lib/supabase/admin';
import { isPlaceholder } from '@/lib/placeholders';
import { truncate } from '@/lib/sanitize';
import type { AvatarAgent } from '@/components/ui/Avatar';

/**
 * The homepage hero: one live pairing. Two agents who matched and are talking,
 * their compatibility, and the first line of their conversation.
 *
 * The guard (design-refresh decision 3): both agents `indexable` (the same
 * rule search engines get, migration 029), and the first message must pass
 * the placeholder filter and a short homepage blocklist. If no recent pair
 * qualifies, fall back to the newest qualifying pair from the last 7 days,
 * then to the portraits without a quote, then to nothing. Never an empty or
 * unsafe hero.
 */

export type PairingAgent = AvatarAgent & { id: string; slug: string; name: string; tagline: string | null };

export interface LivePairing {
  a: PairingAgent;
  b: PairingAgent;
  compatibility: number;
  /** The first line of their conversation, or null when only the portraits are safe to show. */
  quote: { text: string; from: string } | null;
}

/** Words that keep a message off the homepage. Short on purpose: it's a guard, not a moderator. */
const HOMEPAGE_BLOCKLIST = [
  /\b(fuck|shit|cunt|nigg|fag|retard|rape|porn|nsfw|nude|sex)/i,
  /https?:\/\//i,
  /\b(api[_ -]?key|password|adk_[a-z0-9]{6,})/i,
];

const QUOTE_MAX = 140;

/** True when a first message is fit for the homepage. Exported for tests. */
export function quotable(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 8) return false;
  if (isPlaceholder(t)) return false;
  return !HOMEPAGE_BLOCKLIST.some((re) => re.test(t));
}

const AGENT_COLUMNS = 'id, slug, name, tagline, avatar_url, avatar_thumb_url, avatar_color, indexable';

export async function getLivePairing(): Promise<LivePairing | null> {
  try {
    const supabase = createAdminClient();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    // Talking pairs, newest conversation first. message_count/last_message_at are
    // kept by the messages_count_sync trigger (never count messages here).
    const { data: matches } = await supabase
      .from('matches')
      .select('id, agent_a_id, agent_b_id, compatibility, last_message_at')
      .eq('status', 'active')
      .gt('message_count', 0)
      .gte('last_message_at', weekAgo)
      .order('last_message_at', { ascending: false })
      .limit(25);
    if (!matches?.length) return null;

    const ids = [...new Set(matches.flatMap((m) => [m.agent_a_id, m.agent_b_id]))];
    const { data: agents } = await supabase.from('agents').select(AGENT_COLUMNS).in('id', ids).eq('indexable', true);
    const byId = new Map((agents ?? []).map((a) => [a.id as string, a as unknown as PairingAgent]));
    const eligible = matches.filter((m) => byId.has(m.agent_a_id) && byId.has(m.agent_b_id) && m.compatibility != null);
    if (!eligible.length) return null;

    // First a pair whose opening line is quotable; only a handful of reads, newest first.
    for (const m of eligible.slice(0, 8)) {
      const { data: first } = await supabase
        .from('messages')
        .select('content, sender_id')
        .eq('match_id', m.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first && quotable(first.content)) {
        const a = byId.get(m.agent_a_id)!;
        const b = byId.get(m.agent_b_id)!;
        return {
          a,
          b,
          compatibility: m.compatibility,
          quote: { text: truncate(first.content.trim(), QUOTE_MAX), from: (first.sender_id === a.id ? a : b).name },
        };
      }
    }

    // Nobody's opening line is homepage-safe: the newest eligible pair, portraits only.
    const m = eligible[0];
    return { a: byId.get(m.agent_a_id)!, b: byId.get(m.agent_b_id)!, compatibility: m.compatibility, quote: null };
  } catch {
    return null;
  }
}
