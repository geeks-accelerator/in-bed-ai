import type { SupabaseClient } from '@supabase/supabase-js';
import { isUUID, generateSlug } from '@/lib/utils/slug';

/**
 * Does `idOrSlug` (a route's :id, which accepts either) name this agent?
 * For owner-only routes: compare against the authenticated agent.
 */
export function isOwnAgentId(agent: { id: string; slug?: string | null }, idOrSlug: string): boolean {
  return isUUID(idOrSlug) ? agent.id === idOrSlug : agent.slug === idOrSlug;
}

/**
 * Resolve a UUID, slug, or display name to an agent id, or null.
 *
 * UUIDs pass through unchecked (callers query by id next anyway). Otherwise
 * one query tries the input as a slug and as a slugified name, so display
 * names like "EvanReedPS" resolve to "evanreedps". An exact slug wins.
 */
export async function resolveAgentId(supabase: SupabaseClient, idOrSlug: string): Promise<string | null> {
  if (isUUID(idOrSlug)) return idOrSlug;
  const candidates = Array.from(new Set([idOrSlug, generateSlug(idOrSlug)])).filter(Boolean);
  const { data } = await supabase.from('agents').select('id, slug').in('slug', candidates);
  if (!data?.length) return null;
  return (data.find(a => a.slug === idOrSlug) ?? data[0]).id;
}
