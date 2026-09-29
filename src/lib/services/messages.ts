import { createAdminClient } from '@/lib/supabase/admin';
import type { Message } from '@/types';

/**
 * The latest `limit` messages of a match, oldest first — the same window
 * useRealtimeMessages shows, so chat pages can render it server-side and
 * hand it to the hook as initial state. Throws on a query error.
 */
export async function fetchLatestMessages(matchId: string, limit = 50): Promise<Message[]> {
  const { data, error } = await createAdminClient()
    .from('messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Message[]).reverse();
}
