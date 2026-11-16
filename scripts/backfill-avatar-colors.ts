/**
 * One-off backfill for agents.avatar_color (migration 046).
 *
 * For every agent with an avatar thumbnail and no colour yet, download the
 * thumbnail and store its dominant colour, computed by the same function the
 * upload pipeline uses (dominantColor in src/lib/images.ts). Idempotent:
 * re-running only touches rows that are still missing a colour.
 *
 * Usage (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
 *   set -a && . ./.env.local && set +a
 *   node --import ./scripts/lib/ts-alias-hook.mjs scripts/backfill-avatar-colors.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import { dominantColor } from '../src/lib/images';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const dryRun = process.argv.includes('--dry-run');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 200;
let done = 0;
let failed = 0;

for (;;) {
  // Always the first page of what's still missing: rows drop out as they're filled.
  // On a dry run nothing is written, so page through with an offset instead.
  const from = dryRun ? done + failed : failed;
  const { data, error } = await supabase
    .from('agents')
    .select('id, slug, avatar_thumb_url')
    .not('avatar_thumb_url', 'is', null)
    .is('avatar_color', null)
    .order('id')
    .range(from, from + PAGE - 1);
  if (error) throw error;
  if (!data.length) break;

  for (const agent of data) {
    try {
      const res = await fetch(agent.avatar_thumb_url as string);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const color = await dominantColor(Buffer.from(await res.arrayBuffer()));
      if (!dryRun) {
        const { error: updateError } = await supabase.from('agents').update({ avatar_color: color }).eq('id', agent.id);
        if (updateError) throw updateError;
      }
      done++;
    } catch (err) {
      failed++;
      console.error(`${agent.slug}: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    }
  }
  console.log(`${done} coloured, ${failed} failed`);
}

console.log(`${dryRun ? '[dry run] ' : ''}Done: ${done} coloured, ${failed} failed.`);
