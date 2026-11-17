/**
 * inbed.ai's attribution section for the production report: where the agents
 * that registered came from (src/lib/attribution.ts). Project-specific, so it
 * lives here and not in prod-report-core.ts, which is a copy of the agents
 * repo's shared file and is replaced whole when that file changes.
 */
import { pgEnv, readonlyUrl, redact, type SectionSpec, type Warning, type Window } from './prod-report-core.ts';

const end = (w: Window) => Date.parse(`${w.to}T00:00:00Z`) + 864e5;

export interface AttributionOptions {
  /** Agent slugs we run ourselves. Excluded from every rate: not a channel. */
  ourSlugs?: string[];
  /**
   * A table or view holding `id` for every account that is an automated probe,
   * so the report excludes exactly what the research pages exclude (inbed.ai:
   * probe_ids, migration 045, kept from research_probe_ids()). The read-only
   * role reads it (migration 049).
   */
  probeTable?: string;
  /** Don't rank a channel below this many sign-ups. One at 100% of 2 is noise. */
  minToRank?: number;
  /** Days after sign-up by which an agent must have acted to count as stayed. */
  returnWindowDays?: number;
}

interface AttributionRow {
  utm_content: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  registration_user_agent: string | null;
  id: string;
  slug: string | null;
  created_at: string;
  last_active: string | null;
}

interface Tally { key: string; n: number; stayed: number }

export interface AttributionData {
  migrated: boolean;
  error?: string;
  /** The probe function could not be read, so probes are counted as sign-ups. */
  probeError?: string;
  total: number;
  excluded: number;
  taggedContent: number;
  inboundRows: number;
  surfaces: Tally[];
  clients: Tally[];
  inbound: { field: string; values: Tally[] }[];
  unknownTags: Tally[];
  clusters: { key: string; n: number }[];
  minToRank: number;
  returnWindowDays: number;
}

const pct = (n: number, of: number) => (of === 0 ? '—' : `${Math.round((n / of) * 100)}%`);

/** Group rows by a key, counting sign-ups and how many came back. */
function tally(rows: AttributionRow[], key: (r: AttributionRow) => string | null, stayed: (r: AttributionRow) => boolean): Tally[] {
  const by = new Map<string, Tally>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    const t = by.get(k) ?? { key: k, n: 0, stayed: 0 };
    t.n++;
    if (stayed(r)) t.stayed++;
    by.set(k, t);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/**
 * Where the agents that registered in the window came from, and which of those
 * channels produced agents that stayed.
 *
 * Reads only the attribution columns plus slug (to exclude our own agents) and
 * the two timestamps. Identifiers are used to group and never printed: the
 * one-actor check reports how far a channel collapses, not who collapsed it.
 *
 * utm_content is ours, so a gap in it is our bug and gets chased. The four
 * inbound fields arrive only when a link carried them, so their coverage is a
 * floor and never a share — they are never a denominator.
 */
export function attribution(o: AttributionOptions = {}): SectionSpec<AttributionData> {
  const ourSlugs = new Set((o.ourSlugs ?? []).map((s) => s.toLowerCase()));
  const probeTable = o.probeTable;
  const minToRank = o.minToRank ?? 10;
  const returnWindowDays = o.returnWindowDays ?? 7;

  return {
    source: 'Supabase through the read-only role (psql), agents registered in the window: utm_*, registration_user_agent, last_active',
    windowed: true,
    title: 'Attribution',
    read: (ctx): AttributionData => {
      const empty: AttributionData = {
        migrated: false, total: 0, excluded: 0, taggedContent: 0, inboundRows: 0,
        surfaces: [], clients: [], inbound: [], unknownTags: [], clusters: [],
        minToRank, returnWindowDays,
      };
      if (probeTable && !/^[a-z_][a-z0-9_]*$/.test(probeTable)) throw new Error(`not a plain name: ${probeTable}`);
      const url = readonlyUrl();
      Object.assign(process.env, pgEnv(url));
      const from = `${ctx.now.from}T00:00:00Z`;
      const to = new Date(end(ctx.now)).toISOString();
      const probe = probeTable ? `exists (select 1 from public."${probeTable}" p where p.id = a.id)` : 'false';
      const sql = `select coalesce(json_agg(t), '[]') from (select a.id, a.slug, a.created_at, a.last_active, ` +
        `a.utm_content, a.utm_source, a.utm_medium, a.utm_campaign, a.utm_term, a.registration_user_agent, ${probe} as probe ` +
        `from public.agents a where a.created_at >= '${from}' and a.created_at < '${to}') t`;

      let all: (AttributionRow & { probe: boolean })[];
      try {
        all = JSON.parse(ctx.run('psql', ['-AtX', '-v', 'ON_ERROR_STOP=1', '-c', sql]));
      } catch (e) {
        const msg = redact(e instanceof Error ? e.message : String(e), url);
        // Migration 032 not applied yet: the app can ship before the database does.
        if (/utm_content.*does not exist/i.test(msg)) {
          return { ...empty, error: 'migration 032 is not applied to this database yet — no attribution columns' };
        }
        // The probe table unreadable (049 not applied): say so rather than
        // counting probes as channels without a word.
        if (probeTable && new RegExp(`${probeTable}|permission denied`).test(msg)) {
          return { ...empty, error: `${probeTable} can't be read through the read-only role; probes would count as sign-ups` };
        }
        return { ...empty, error: `psql: ${msg.replace(/\s+/g, ' ').slice(0, 200)}` };
      }
      const probes = new Set(all.filter((r) => r.probe).map((r) => r.id));
      const mine = (r: AttributionRow) => ourSlugs.has((r.slug ?? '').toLowerCase()) || probes.has(r.id);
      const rows = all.filter((r) => !mine(r));
      const stayed = (r: AttributionRow) =>
        r.last_active != null &&
        new Date(r.last_active).getTime() - new Date(r.created_at).getTime() >= returnWindowDays * 86_400_000;

      const inbound = (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'] as const).map((field) => ({
        field,
        values: tally(rows, (r) => r[field], stayed),
      }));

      return {
        migrated: true,
        total: rows.length,
        excluded: all.length - rows.length,
        taggedContent: rows.filter((r) => r.utm_content).length,
        inboundRows: rows.filter((r) => r.utm_source || r.utm_medium || r.utm_campaign || r.utm_term).length,
        surfaces: tally(rows, (r) => (r.utm_content?.startsWith('unknown:') ? null : r.utm_content), stayed),
        unknownTags: tally(rows, (r) => (r.utm_content?.startsWith('unknown:') ? r.utm_content : null), stayed),
        clients: tally(rows, (r) => clientOf(r.registration_user_agent), stayed),
        inbound,
        // One actor check: a channel whose sign-ups collapse under
        // (client, hour) was one operator's script, not a channel.
        clusters: tally(
          rows.filter((r) => r.utm_content),
          (r) => `${r.utm_content}\u0000${clientOf(r.registration_user_agent)}\u0000${r.created_at.slice(0, 13)}`,
          () => false,
        ).filter((t) => t.n >= 3).map((t) => ({ key: t.key.split('\u0000')[0], n: t.n })),
        minToRank,
        returnWindowDays,
      };
    },
    warnings: (d) => {
      if (d.error) return [{ at: '', warn: d.error }];
      const w: Warning[] = [];
      if (d.probeError) w.push({ at: 'probes', warn: d.probeError });
      // A gap in utm_content is OUR bug: some surface is shipping untagged.
      if (d.total > 0 && d.taggedContent < d.total) {
        w.push({ at: 'utm_content', warn: `${d.total - d.taggedContent} of ${d.total} sign-ups carried no utm_content — a surface is untagged` });
      }
      for (const t of d.unknownTags) {
        w.push({ at: 'utm_content', warn: `${t.n} sign-up(s) used ${t.key}, which we never published` });
      }
      for (const c of d.clusters) {
        w.push({ at: c.key, warn: `${c.n} sign-ups from one client within one hour — check whether this channel is one actor` });
      }
      return w;
    },
    text: (d) => {
      if (d.error) return [`  ${d.error}`];
      if (d.total === 0) return ['  no sign-ups in the window'];
      const out: string[] = [];
      // Coverage first: it decides whether anything below means anything.
      out.push(`  coverage: ${d.taggedContent} of ${d.total} tagged (${pct(d.taggedContent, d.total)})` +
        (d.excluded ? `, ${d.excluded} of ours or probes excluded` : ''));
      out.push(`  by surface (n, stayed ${d.returnWindowDays}d; unranked below n=${d.minToRank}):`);
      const rank = d.surfaces.filter((t) => t.n >= d.minToRank);
      const thin = d.surfaces.filter((t) => t.n < d.minToRank);
      for (const t of rank) out.push(`    ${String(t.n).padStart(5)}  ${t.key} — stayed ${t.stayed} (${pct(t.stayed, t.n)})`);
      for (const t of thin) out.push(`    ${String(t.n).padStart(5)}  ${t.key} — stayed ${t.stayed} (too few to rank)`);
      if (d.clients.length) {
        out.push('  by client:');
        for (const t of d.clients.slice(0, 8)) out.push(`    ${String(t.n).padStart(5)}  ${t.key} — stayed ${t.stayed} (${pct(t.stayed, t.n)})`);
      }
      // A floor, never a share: nobody owes us these, so they are not a denominator.
      if (d.inboundRows === 0) {
        out.push('  inbound: 0 rows carried utm_source, utm_medium, utm_campaign or utm_term (a floor, not a share)');
      } else {
        out.push(`  inbound (${d.inboundRows} rows carried one; a floor, not a share):`);
        for (const f of d.inbound) {
          for (const t of f.values) out.push(`    ${String(t.n).padStart(5)}  ${f.field}=${t.key} — stayed ${t.stayed}`);
        }
      }
      return out;
    },
  };
}

/** A User-Agent reduced to a client name, so nothing identifying is printed. */
function clientOf(ua: string | null): string | null {
  if (!ua) return null;
  const name = /^([A-Za-z0-9._-]+)\/[\d.]+/.exec(ua.trim())?.[1];
  if (name) return name.toLowerCase();
  if (/\bMozilla\//.test(ua)) return 'browser';
  return 'other';
}
