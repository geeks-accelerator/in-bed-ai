// The shared report file: geeks-accelerator/agents, report/prod-report-core.ts. Change it there and copy it here; never edit this copy.
/**
 * Every number about production in one place, for an agent or a person to read
 * (the agents' standards: docs/standard.md, "The report"). It gathers and
 * judges nothing beyond the warnings a reader should start with. Each section
 * says where its numbers came from (`source`) and which days they cover
 * (`window`); a section that can't be read says why (`error`) and the rest
 * still comes.
 *
 * A project copies this file to scripts/prod-report-core.ts and lists its
 * sections in its own scripts/prod-report.ts: the shared ones below, set up for
 * it, and its own, in the same shape (`SectionSpec`).
 *
 *   import { report, deploys, probes } from './prod-report-core.ts';
 *   await report({
 *     site: 'https://example.com',
 *     sections: { deploys: deploys({ services: ['web'] }), probes: probes([{ what: 'home', path: '/', expect: 200 }]) },
 *   });
 *
 *   npm run prod-report                         the last 7 days, as text
 *   npm run prod-report -- --days 28            another window
 *   npm run prod-report -- --json               the whole of it, as JSON (schema_version)
 *   npm run prod-report -- --only probes        some sections (comma-separated)
 *
 * A whole run also keeps reports/<date>.json and .md (git-ignored), so a day's
 * numbers can be read again. A run with --only keeps nothing, so a part never
 * replaces the day's whole report. Keys come from .env.prod, then .env, read by
 * name; none is printed. CI is read with `gh`, Railway with `railway` (the
 * checkout is linked).
 *
 * Run by Node directly (no build). Nothing runs on import: the pure parts are
 * exported for report/prod-report-core.test.ts, in the agents repo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bumped whenever a field's meaning or shape changes, so a reader can tell.
 * 2: one shared file; `deploys.railway` is keyed by service.
 */
export const SCHEMA_VERSION = 2;

export interface Window {
  from: string;
  to: string;
}

/** A section: its numbers, or why there are none. */
export type Section<T> = { source: string; window: Window | null; data: T } | { source: string; window: Window | null; error: string };

export interface Warning {
  at: string;
  warn: string;
}

/** What a section reads with. */
export interface Context {
  site: string;
  now: Window;
  before: Window;
  run(cmd: string, args: string[]): string;
  runJson<T>(cmd: string, args: string[], empty: T): T;
}

/** One section of the report: a shared one below, or a project's own. */
export interface SectionSpec<T = unknown> {
  /** Where its numbers come from, as the report says it. */
  source: string;
  /** Its numbers cover the window; otherwise they're the live site's answers now. */
  windowed: boolean;
  read(ctx: Context): Promise<T> | T;
  /** What a reader must see first. `at` is within the section ('' for the section itself). */
  warnings?(data: T): Warning[];
  /** Its lines in the text form, under its heading. */
  text?(data: T): string[];
  /** Its heading in the text form; the section's name when there's none. */
  title?: string;
}

export interface ReportConfig {
  /** The live site, as https://host. */
  site: string;
  /** By the standard's names: `deploys`, `probes`, then the project's own. */
  sections: Record<string, SectionSpec>;
}

export interface Report {
  schema_version: number;
  site: string;
  generated: string;
  days: number;
  window: Window;
  before: Window;
  warnings: Warning[];
  sections: Record<string, Section<unknown>>;
}

/** The `days` days ending `today` (UTC dates, inclusive), and the same length just before. */
export function windows(days: number, today: string): { now: Window; before: Window } {
  const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) - offset * 864e5).toISOString().slice(0, 10);
  return { now: { from: day(days - 1), to: today }, before: { from: day(2 * days - 1), to: day(days) } };
}

const start = (w: Window) => Date.parse(`${w.from}T00:00:00Z`);
const end = (w: Window) => Date.parse(`${w.to}T00:00:00Z`) + 864e5;
const inWindow = (at: string, w: Window) => Date.parse(at) >= start(w) && Date.parse(at) < end(w);

const oneLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 300);

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
const runJson = <T>(cmd: string, args: string[], empty: T): T => {
  const out = run(cmd, args).trim();
  return out ? (JSON.parse(out) as T) : empty;
};

// ─── deploys ───────────────────────────────────────────────────────────

/** A row of `railway deployment list --json`. */
export interface RailwayDeployment {
  id: string;
  status: string;
  createdAt: string;
  meta?: { commitHash?: string | null; commitMessage?: string | null; commitAuthor?: string | null; approvalReason?: string | null } | null;
}

const FAILED = ['FAILED', 'CRASHED'];
/** Not live yet: building, or held until someone approves it in Railway. */
const WAITING = ['NEEDS_APPROVAL', 'WAITING', 'QUEUED', 'BUILDING', 'DEPLOYING', 'INITIALIZING'];
/** Railway lists only its latest 20 deployments. */
export const RAILWAY_LIST_LIMIT = 20;

const deployment = (d: RailwayDeployment) => ({
  at: d.createdAt,
  status: d.status,
  commit: d.meta?.commitHash?.slice(0, 7) ?? null,
  message: d.meta?.commitMessage?.split('\n')[0]?.slice(0, 100) ?? null,
  ...(d.meta?.approvalReason ? { why: `${d.meta.approvalReason}${d.meta.commitAuthor ? ` (${d.meta.commitAuthor})` : ''}` } : {}),
});

/**
 * One service's deployments in the window. The list holds only Railway's
 * latest 20, so `covers` says how far back it reaches when it is full, and the
 * window before is counted only when the list reaches it.
 */
export function railwayService(list: RailwayDeployment[], now: Window, before: Window) {
  const sorted = [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const covers = sorted.length >= RAILWAY_LIST_LIMIT ? sorted[sorted.length - 1]!.createdAt : null;
  const reachesBefore = !covers || Date.parse(covers) <= start(before);
  const inNow = sorted.filter((d) => inWindow(d.createdAt, now));
  const live = sorted.find((d) => d.status === 'SUCCESS');
  return {
    deployments: inNow.length,
    before: reachesBefore ? sorted.filter((d) => inWindow(d.createdAt, before)).length : null,
    covers,
    live: live ? deployment(live) : null,
    failed: inNow.filter((d) => FAILED.includes(d.status)).map(deployment),
    /** Newer than the live one and not finished: building, or held for approval (2026-11-02: every agent push waited). */
    waiting: sorted.filter((d) => WAITING.includes(d.status) && (!live || Date.parse(d.createdAt) > Date.parse(live.createdAt))).map(deployment),
  };
}

/** A row of `gh run list --json`. */
export interface GhRun {
  workflowName: string;
  conclusion: string;
  status: string;
  createdAt: string;
  headSha: string;
  headBranch: string;
  event: string;
}

/**
 * CI in the window: runs per workflow, and the failures on main (a Dependabot
 * branch's failure isn't production's). `workflows` tells a repo without CI
 * from one whose CI didn't run.
 */
export function ciRuns(runs: GhRun[], workflows: number) {
  const rows = runs.map((r) => ({ workflow: r.workflowName, at: r.createdAt, commit: r.headSha.slice(0, 7), branch: r.headBranch, event: r.event, result: r.conclusion || r.status }));
  const byWorkflow: Record<string, number> = {};
  for (const r of rows) byWorkflow[r.workflow] = (byWorkflow[r.workflow] ?? 0) + 1;
  return {
    workflows,
    runs: rows.length,
    byWorkflow,
    failed: rows.filter((r) => r.branch === 'main' && !['success', 'skipped', 'in_progress', 'queued', 'pending', 'waiting'].includes(r.result)),
  };
}

export interface Deploys {
  ci: ReturnType<typeof ciRuns>;
  railway: Record<string, ReturnType<typeof railwayService>>;
}

export function deploysWarnings(d: Deploys): Warning[] {
  const out: Warning[] = [];
  for (const f of d.ci.failed) out.push({ at: 'ci', warn: `${f.workflow} ${f.result} at ${f.at} (${f.commit})` });
  for (const [service, s] of Object.entries(d.railway)) {
    for (const f of s.failed) out.push({ at: `railway.${service}`, warn: `${f.status} at ${f.at} (${f.commit}: ${f.message})` });
    for (const w of s.waiting) out.push({ at: `railway.${service}`, warn: `${w.status}${w.why ? `, ${w.why}` : ''} since ${w.at} (${w.commit}: ${w.message})` });
  }
  return out;
}

export function deploysText(d: Deploys): string[] {
  const per = Object.entries(d.ci.byWorkflow).map(([w, n]) => `${w} ${n}`).join(', ');
  const out = [
    d.ci.workflows === 0 ? 'CI: none (no workflows)' : `CI: ${d.ci.runs} runs${per ? ` (${per})` : ''}, ${d.ci.failed.length} failed on main`,
    ...d.ci.failed.map((f) => `  ${f.result} ${f.at} ${f.commit} ${f.workflow}`),
  ];
  for (const [service, r] of Object.entries(d.railway)) {
    out.push(
      `Railway ${service}: ${r.deployments} deployments (before: ${r.before ?? 'not reached'})${r.covers ? `; the list reaches back to ${r.covers}` : ''}, ${r.failed.length} failed`,
      `  live: ${r.live ? `${r.live.commit ?? '(no commit)'} since ${r.live.at}${r.live.message ? ` ${r.live.message}` : ''}` : 'none'}`,
      ...r.failed.map((x) => `  ${x.status} ${x.at} ${x.commit} ${x.message}`),
      ...r.waiting.map((x) => `  ${x.status}${x.why ? ` (${x.why})` : ''} ${x.at} ${x.commit} ${x.message}`),
    );
  }
  return out;
}

/** CI, and each Railway service's deployments. */
export function deploys(o: { services: string[] }): SectionSpec<Deploys> {
  return {
    source: `gh run list --created; railway deployment list (${o.services.join(', ')})`,
    windowed: true,
    title: 'Deploys',
    read: (ctx) => {
      // Read by date, not by count (the standard).
      const runs = ctx.runJson<GhRun[]>('gh', ['run', 'list', '--created', `>=${ctx.now.from}`, '--limit', '1000', '--json', 'workflowName,conclusion,status,createdAt,headSha,headBranch,event'], []);
      const workflows = ctx.runJson<unknown[]>('gh', ['workflow', 'list', '--all', '--json', 'name'], []).length;
      const railway = Object.fromEntries(o.services.map((s) => [s, railwayService(ctx.runJson<RailwayDeployment[]>('railway', ['deployment', 'list', '-s', s, '--json'], []), ctx.now, ctx.before)]));
      return { ci: ciRuns(runs, workflows), railway };
    },
    warnings: deploysWarnings,
    text: deploysText,
  };
}

// ─── probes ────────────────────────────────────────────────────────────

export interface Probe {
  what: string;
  path: string;
  expect: number;
  method?: 'GET' | 'POST';
  /** Sent with the request. */
  accept?: string;
  /** Headers the answer must carry. */
  headers?: string[];
  /** The answer's content type must start with this. */
  type?: string;
  /** For a redirect, where it must point. */
  location?: string;
}

export interface ProbeResult {
  what: string;
  path: string;
  status: number;
  ok: boolean;
  ms: number;
  error?: string;
}

/** What a probe's answer got wrong, if anything. */
export function probeProblems(p: Probe, res: { status: number; headers: Headers }, site: string): string[] {
  const problems: string[] = [];
  if (res.status !== p.expect) problems.push(`expected ${p.expect}`);
  const missing = (p.headers ?? []).filter((h) => !res.headers.has(h));
  if (missing.length) problems.push(`missing ${missing.join(', ')}`);
  const type = res.headers.get('content-type') ?? '';
  if (p.type && !type.startsWith(p.type)) problems.push(`content-type ${type || 'none'}`);
  const location = res.headers.get('location') ?? '';
  if (p.location && new URL(location, site).pathname !== p.location) problems.push(`redirects to ${location || 'nowhere'}`);
  return problems;
}

async function probe(site: string, p: Probe): Promise<ProbeResult> {
  const t = performance.now();
  try {
    const res = await fetch(site + p.path, {
      method: p.method ?? 'GET',
      redirect: 'manual',
      headers: { 'user-agent': `${new URL(site).hostname}-prod-report`, ...(p.accept ? { accept: p.accept } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    await res.arrayBuffer();
    const problems = probeProblems(p, res, site);
    return { what: p.what, path: p.path, status: res.status, ok: !problems.length, ms: Math.round(performance.now() - t), ...(problems.length ? { error: problems.join('; ') } : {}) };
  } catch (e) {
    return { what: p.what, path: p.path, status: 0, ok: false, ms: Math.round(performance.now() - t), error: oneLine(e) };
  }
}

/** Two at a time, as every sweep of the live site is (the agents' rules). */
async function probeAll(site: string, list: Probe[]): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  for (let i = 0; i < list.length; i += 2) out.push(...(await Promise.all(list.slice(i, i + 2).map((p) => probe(site, p)))));
  return out;
}

/** The live site's key answers, now. */
export function probes(list: Probe[]): SectionSpec<ProbeResult[]> {
  return {
    source: 'requests to the site, now, two at a time',
    windowed: false,
    title: 'The live site, now',
    read: (ctx) => probeAll(ctx.site, list),
    warnings: (rs) => rs.filter((p) => !p.ok).map((p) => ({ at: '', warn: `${p.path} answered ${p.status}: ${p.error}` })),
    text: (rs) => rs.map((p) => `${p.ok ? 'ok  ' : 'FAIL'} ${String(p.status).padEnd(3)} ${String(p.ms).padStart(5)} ms  ${p.path}  ${p.what}${p.error ? ` (${p.error})` : ''}`),
  };
}

// ─── the whole ─────────────────────────────────────────────────────────

/** A project's function that throws must not lose the report: it says so instead. */
function safely<T>(what: string, f: () => T, otherwise: (message: string) => T): T {
  try {
    return f();
  } catch (e) {
    return otherwise(`${what}: ${oneLine(e)}`);
  }
}

/** Everything the sections raised, in one list, so a reader starts there. */
export function warningsOf(config: ReportConfig, sections: Record<string, Section<unknown>>): Warning[] {
  const out: Warning[] = [];
  for (const [name, s] of Object.entries(sections)) {
    if ('error' in s) {
      out.push({ at: name, warn: `couldn't read: ${s.error}` });
      continue;
    }
    const spec = config.sections[name];
    const raised = safely('its warnings failed', () => spec?.warnings?.(s.data) ?? [], (warn) => [{ at: '', warn }]);
    for (const w of raised) out.push({ at: w.at ? `${name}.${w.at}` : name, warn: w.warn });
  }
  return out;
}

export interface Options {
  days: number;
  only?: string[] | null;
  /** today's UTC date, for tests */
  today?: string;
}

export async function prodStats(config: ReportConfig, o: Options): Promise<Report> {
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  const { now, before } = windows(o.days, today);
  const ctx: Context = { site: config.site, now, before, run, runJson };
  const sections: Record<string, Section<unknown>> = {};
  for (const [name, spec] of Object.entries(config.sections)) {
    if (o.only && !o.only.includes(name)) continue;
    const window = spec.windowed ? now : null;
    try {
      sections[name] = { source: spec.source, window, data: await spec.read(ctx) };
    } catch (e) {
      sections[name] = { source: spec.source, window, error: oneLine(e) };
    }
  }
  return { schema_version: SCHEMA_VERSION, site: config.site, generated: new Date().toISOString(), days: o.days, window: now, before, warnings: warningsOf(config, sections), sections };
}

/** The JSON form: the head, `warnings`, then one key per section (the standard). */
export function json(r: Report): string {
  const { sections, ...head } = r;
  return JSON.stringify({ ...head, ...sections }, null, 2) + '\n';
}

export function text(config: ReportConfig, r: Report): string {
  const out: string[] = [
    `# Production of ${new URL(r.site).hostname}, ${r.window.from} to ${r.window.to} (${r.days} days; compared with ${r.before.from} to ${r.before.to}), ${r.generated}`,
    '',
    `## Warnings (${r.warnings.length})`,
    ...r.warnings.map((w) => `- ${w.at}: ${w.warn}`),
    '',
  ];
  for (const [name, s] of Object.entries(r.sections)) {
    const spec = config.sections[name];
    out.push(`## ${spec?.title ?? name}`);
    if ('error' in s) out.push(`  (couldn't read: ${s.error})`);
    else if (spec?.text) out.push(...safely('its text failed', () => spec.text!(s.data), (m) => [`  (${m})`]));
    else out.push('  (in the JSON: --json)');
    out.push('');
  }
  return out.join('\n');
}

/** `--days`, `--json`, `--only`, checked against the sections there are. */
export function parseArgs(args: string[], names: string[]): { days: number; json: boolean; only: string[] | null } {
  const opts = { days: 7, json: false, only: null as string[] | null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--days') opts.days = Number(args[++i]);
    else if (a === '--json') opts.json = true;
    else if (a === '--only') opts.only = (args[++i] ?? '').split(',').filter(Boolean);
    else throw new Error(`Unknown option ${a}`);
  }
  if (!Number.isInteger(opts.days) || opts.days < 1 || opts.days > 90) throw new Error('--days takes 1 to 90');
  const unknown = (opts.only ?? []).filter((s) => !names.includes(s));
  if (unknown.length) throw new Error(`--only takes ${names.join(', ')}; not ${unknown.join(', ')}`);
  return opts;
}

/** The command: a project's scripts/prod-report.ts calls this with its sections. */
export async function report(config: ReportConfig, args = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(args, Object.keys(config.sections));
  // The project's root: this copy lives in its scripts/. The first file read wins a key, and the shell's own wins over both.
  const root = join(import.meta.dirname, '..');
  for (const f of ['.env.prod', '.env']) if (existsSync(join(root, f))) process.loadEnvFile(join(root, f));
  const r = await prodStats(config, { days: opts.days, only: opts.only });
  const md = text(config, r);
  if (!opts.only) {
    const dir = join(root, 'reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${r.window.to}.json`), json(r));
    writeFileSync(join(dir, `${r.window.to}.md`), md);
  }
  process.stdout.write(opts.json ? json(r) : md);
}
