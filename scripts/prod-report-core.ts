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
 *
 * The shared sections: `deploys`, `github` (what's open on the repos),
 * `probes`, `errors` (Railway's log), `activity` (Supabase counts),
 * `search.bing` (Bing Webmaster) and `cloudflare` (the zone's requests).
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

// ─── github ────────────────────────────────────────────────────────────

/** A row of `gh pr list --author app/dependabot --json number,title,createdAt,statusCheckRollup`. */
export interface GhPr {
  number: number;
  title: string;
  createdAt: string;
  statusCheckRollup: { conclusion?: string | null; state?: string | null; status?: string | null }[] | null;
}

/** An open issue or PR from `gh api repos/<repo>/issues`, with its last comment's author read for outside ones. */
export interface GhIssue {
  number: number;
  title: string;
  created_at: string;
  login: string;
  association: string;
  bot: boolean;
  pr: boolean;
  comments: number;
  /** The last comment's author association and login, when there are comments. */
  last?: { association: string; login: string } | null;
}

/** An open Dependabot alert, from `gh api repos/<repo>/dependabot/alerts`. */
export interface GhAlert {
  number: number;
  severity: string;
  package: string;
  manifest: string;
  patched: string | null;
  /** `development` when only the build and tests use it: listed, but no warning (drifts, 2026-11-03: two such alerts waited on upstream ranges). */
  scope?: string | null;
}

const DAY = 864e5;
const age = (at: string, nowMs: number) => Math.floor((nowMs - Date.parse(at)) / DAY);

/**
 * What a Dependabot PR's title says it updates. A group is read on its branch;
 * a 0.x minor can break things, so it counts with the majors (the github task).
 */
export function updateType(title: string): 'major' | 'minor' | 'patch' | 'group' | 'other' {
  if (/\bgroup\b/.test(title) && !/\bfrom\b.*\bto\b/.test(title)) return 'group';
  const m = title.match(/from v?(\d+)\.(\d+)(?:\.(\d+))?\S* to v?(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return 'other';
  const [a1, a2, b1, b2] = [m[1], m[2], m[4], m[5]].map(Number) as [number, number, number, number];
  if (a1 !== b1) return 'major';
  if (a2 !== b2) return a1 === 0 ? 'major' : 'minor';
  return 'patch';
}

/** A PR's checks as one word: none ran, still running, all passed, or one failed. */
export function checksOf(rollup: GhPr['statusCheckRollup']): 'none' | 'pending' | 'green' | 'red' {
  const rows = rollup ?? [];
  if (!rows.length) return 'none';
  const results = rows.map((r) => (r.conclusion || r.state || r.status || '').toUpperCase());
  if (results.some((x) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(x))) return 'red';
  if (results.every((x) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(x))) return 'green';
  return 'pending';
}

const OURS = ['OWNER', 'MEMBER', 'COLLABORATOR'];

/** Open issues and PRs by outside people (not the org, not a bot, not a login the project names as its own), and whether our word was the last. */
export function outsideItems(issues: GhIssue[], nowMs: number, ours: string[] = []) {
  const isOurs = (association: string, login: string) => OURS.includes(association) || ours.includes(login);
  return issues
    .filter((i) => !i.bot && !isOurs(i.association, i.login))
    .map((i) => ({
      number: i.number,
      kind: i.pr ? ('pr' as const) : ('issue' as const),
      title: i.title.slice(0, 100),
      by: i.login,
      days: age(i.created_at, nowMs),
      comments: i.comments,
      answered: !!i.last && isOurs(i.last.association, i.last.login),
    }));
}

/** The manifests Dependabot can watch, from a repo's file list: [ecosystem, directory]. Dot-directories and node_modules are left out. */
export function manifestsOf(paths: string[]): [string, string][] {
  const out = new Map<string, [string, string]>();
  for (const p of paths) {
    if (/(^|\/)(node_modules|\.[^/]+)\//.test(p)) continue;
    const name = p.split('/').pop()!;
    const eco = name === 'package.json' ? 'npm' : name === 'pyproject.toml' || /^requirements.*\.txt$/.test(name) ? 'pip' : name === 'Dockerfile' ? 'docker' : null;
    if (!eco) continue;
    const dir = '/' + p.split('/').slice(0, -1).join('/');
    out.set(`${eco} ${dir}`, [eco, dir]);
  }
  return [...out.values()];
}

/** The ecosystems and directories a dependabot.yml covers, and whether it has a cooldown. */
export function dependabotConfig(yml: string): { cooldown: boolean; covers: [string, string][] } {
  const covers: [string, string][] = [];
  for (const block of yml.split(/^\s*-\s*package-ecosystem:/m).slice(1)) {
    const eco = block.match(/^\s*["']?([\w-]+)/)?.[1] ?? '';
    const dirs = [...block.matchAll(/^\s*(?:directory:|-)\s*["']?(\/[^"'\s#]*)/gm)].map((m) => m[1]!);
    for (const d of dirs) covers.push([eco === 'npm_and_yarn' ? 'npm' : eco, d.length > 1 ? d.replace(/\/$/, '') : d]);
  }
  return { cooldown: /^\s*cooldown:/m.test(yml), covers };
}

export interface GithubRepo {
  dependabot: { number: number; title: string; days: number; type: ReturnType<typeof updateType>; checks: ReturnType<typeof checksOf> }[];
  /** `off` when the repo has Dependabot alerts turned off (a setting: the humans'). */
  alerts: 'off' | GhAlert[];
  outside: ReturnType<typeof outsideItems>;
  /** `file` is false when there's no .github/dependabot.yml; `uncovered` lists manifests it doesn't watch. */
  config: { file: boolean; cooldown: boolean; uncovered: string[] };
}

export type Github = Record<string, GithubRepo | { error: string }>;

export function githubRepo(o: { prs: GhPr[]; alerts: 'off' | GhAlert[]; issues: GhIssue[]; yml: string | null; paths: string[]; nowMs: number; ours?: string[] }): GithubRepo {
  const cfg = o.yml === null ? null : dependabotConfig(o.yml);
  const covered = new Set((cfg?.covers ?? []).map(([e, d]) => `${e} ${d}`));
  return {
    dependabot: o.prs.map((p) => ({ number: p.number, title: p.title.slice(0, 100), days: age(p.createdAt, o.nowMs), type: updateType(p.title), checks: checksOf(p.statusCheckRollup) })),
    alerts: o.alerts,
    outside: outsideItems(o.issues, o.nowMs, o.ours),
    config: { file: cfg !== null, cooldown: cfg?.cooldown ?? false, uncovered: manifestsOf(o.paths).filter(([e, d]) => !covered.has(`${e} ${d}`)).map(([e, d]) => `${e} ${d}`) },
  };
}

/** A week: Dependabot opens PRs on Monday, the github task runs on Thursday. */
const STALE_DAYS = 7;

export function githubWarnings(g: Github): Warning[] {
  const out: Warning[] = [];
  for (const [repo, r] of Object.entries(g)) {
    const at = repo;
    if ('error' in r) continue;
    for (const p of r.dependabot) {
      if (p.checks === 'red') out.push({ at, warn: `Dependabot #${p.number} is red: ${p.title}` });
      else if (p.days > STALE_DAYS) out.push({ at, warn: `Dependabot #${p.number} open ${p.days} days: ${p.title}` });
    }
    if (r.alerts !== 'off') for (const a of r.alerts) if (a.patched && a.scope !== 'development') out.push({ at, warn: `${a.severity} alert in ${a.package} (${a.manifest}), patched in ${a.patched}` });
    for (const i of r.outside) if (!i.answered && i.days > STALE_DAYS) out.push({ at, warn: `${i.kind} #${i.number} from ${i.by}, ${i.days} days without our answer: ${i.title}` });
    if (!r.config.file) {
      if (r.config.uncovered.length) out.push({ at, warn: `no .github/dependabot.yml for ${r.config.uncovered.join(', ')}` });
      continue;
    }
    if (!r.config.cooldown) out.push({ at, warn: 'dependabot.yml has no cooldown' });
    if (r.config.uncovered.length) out.push({ at, warn: `dependabot.yml doesn't watch ${r.config.uncovered.join(', ')}` });
  }
  return out;
}

export function githubText(g: Github): string[] {
  const out: string[] = [];
  for (const [repo, r] of Object.entries(g)) {
    if ('error' in r) {
      out.push(`${repo}: (couldn't read: ${r.error})`);
      continue;
    }
    const alerts = r.alerts === 'off' ? 'alerts off' : `${r.alerts.length} alerts`;
    const config = !r.config.file ? 'no dependabot.yml' : `dependabot.yml${r.config.cooldown ? '' : ' without a cooldown'}${r.config.uncovered.length ? `, missing ${r.config.uncovered.join(', ')}` : ''}`;
    out.push(`${repo}: ${r.dependabot.length} Dependabot PRs, ${alerts}, ${r.outside.length} from outside; ${config}`);
    for (const p of r.dependabot) out.push(`  #${p.number} ${p.type}, ${p.checks}, ${p.days} days: ${p.title}`);
    if (r.alerts !== 'off') for (const a of r.alerts) out.push(`  alert ${a.severity} ${a.package} (${a.manifest}${a.scope === 'development' ? ', development only' : ''}), patched: ${a.patched ?? 'none'}`);
    for (const i of r.outside) out.push(`  ${i.kind} #${i.number} ${i.by}, ${i.days} days, ${i.comments} comments, ${i.answered ? 'answered' : 'not answered'}: ${i.title}`);
  }
  return out;
}

const stderrOf = (e: unknown) => String((e as { stderr?: unknown }).stderr ?? (e as Error).message ?? e);

/**
 * What's open on each of the project's GitHub repos: Dependabot's PRs and
 * alerts, outside people's issues and PRs, and whether dependabot.yml watches
 * every manifest (docs/plans/2026-11-02-github-task.md). `ours` names logins
 * that are the project's own though not in the org (church's site files
 * issues as `achurchai`). One repo that can't be read doesn't hide the others.
 */
export function github(o: { repos: string[]; ours?: string[] }): SectionSpec<Github> {
  return {
    source: `gh pr list, gh api issues, dependabot/alerts, contents and trees (${o.repos.join(', ')})`,
    windowed: false,
    title: 'GitHub',
    read: (ctx) => {
      const nowMs = Date.now();
      const out: Github = {};
      for (const repo of o.repos) {
        try {
          const prs = ctx.runJson<GhPr[]>('gh', ['pr', 'list', '-R', repo, '--author', 'app/dependabot', '--state', 'open', '--limit', '100', '--json', 'number,title,createdAt,statusCheckRollup'], []);
          let alerts: 'off' | GhAlert[];
          try {
            alerts = lines<GhAlert>(ctx.run('gh', ['api', '--paginate', `repos/${repo}/dependabot/alerts?state=open&per_page=100`, '--jq', '.[] | {number, severity: .security_advisory.severity, package: .dependency.package.name, manifest: .dependency.manifest_path, patched: .security_vulnerability.first_patched_version.identifier, scope: .dependency.scope}']));
          } catch (e) {
            if (!/disabled/i.test(stderrOf(e))) throw e;
            alerts = 'off';
          }
          const issues = lines<GhIssue>(ctx.run('gh', ['api', '--paginate', `repos/${repo}/issues?state=open&per_page=100`, '--jq', '.[] | {number, title, created_at, login: .user.login, association: .author_association, bot: (.user.type == "Bot"), pr: (.pull_request != null), comments}']));
          for (const i of issues) {
            if (i.bot || OURS.includes(i.association) || (o.ours ?? []).includes(i.login) || !i.comments) continue;
            const last = lines<{ association: string; login: string }>(ctx.run('gh', ['api', '--paginate', `repos/${repo}/issues/${i.number}/comments?per_page=100`, '--jq', '.[] | {association: .author_association, login: .user.login}'])).pop();
            i.last = last ?? null;
          }
          let yml: string | null = null;
          try {
            yml = Buffer.from(ctx.run('gh', ['api', `repos/${repo}/contents/.github/dependabot.yml`, '--jq', '.content']).trim(), 'base64').toString('utf8');
          } catch (e) {
            if (!/404|Not Found/i.test(stderrOf(e))) throw e;
          }
          const paths = ctx.run('gh', ['api', `repos/${repo}/git/trees/HEAD?recursive=1`, '--jq', '.tree[] | select(.type == "blob") | .path']).split('\n').filter(Boolean);
          out[repo] = githubRepo({ prs, alerts, issues, yml, paths, nowMs, ours: o.ours });
        } catch (e) {
          out[repo] = { error: oneLine(stderrOf(e)) };
        }
      }
      return out;
    },
    warnings: githubWarnings,
    text: githubText,
  };
}

/** One JSON value per line, as `gh api --paginate --jq '.[] | {…}'` prints them. */
const lines = <T>(out: string): T[] => out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);

// ─── errors ────────────────────────────────────────────────────────────

/** A row of `railway logs --json`. */
export interface LogLine {
  timestamp: string;
  message: string;
  level?: string;
}

/** `railway logs` gives at most this many lines a call (more is refused, the standard). */
export const RAILWAY_LOG_LIMIT = 5000;

/**
 * The deployments that ran during the window, each with when it was replaced.
 * `railway logs` reads one deployment's log, so the window is read deployment by
 * deployment (2026-11-03: the default, the latest deployment, held minutes of it).
 */
export function deploymentsInWindow(list: RailwayDeployment[], w: Window) {
  const ran = [...list].filter((d) => d.status === 'SUCCESS' || d.status === 'REMOVED' || d.status === 'CRASHED').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return ran
    .map((d, i) => ({ id: d.id, from: d.createdAt, replacedAt: ran[i + 1]?.createdAt ?? null }))
    .filter((d) => Date.parse(d.from) < end(w) && (d.replacedAt === null || Date.parse(d.replacedAt) > start(w)));
}

/** A log line without the addresses in it: a report never holds an IP (the standard). nginx puts the client's in each error. */
export const withoutAddresses = (message: string) =>
  message.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>').replace(/(?<![\w:])((?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?|(?:[0-9a-f]{1,4}:){5,7}[0-9a-f]{1,4})(?![\w:])/gi, '<ip>');

/** One message's shape, so the same error with other ids or numbers counts once. */
export const errorShape = (message: string) =>
  message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<id>')
    .replace(/\d+/g, '#')
    .replace(/[^\x20-\x7e]+/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

/**
 * Railway calls every line on stderr an error. One that names a lower level
 * itself isn't: nginx's `[notice]`, uvicorn's `INFO:`, `npm warn` (ollamaherd,
 * 2026-11-03: 948 "errors", all of them nginx starting workers).
 */
export const namesLowerLevel = (message: string) =>
  /^\s*(\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d )?\[(debug|info|notice|warn)\]|^\s*(DEBUG|INFO|NOTICE|WARNING|WARN):|^\s*npm warn\b/i.test(message);

/**
 * Error lines grouped by their shape, most first. Counted apart, not as errors:
 * a line logged after its deployment was replaced, the old one shutting down
 * (`npm error signal SIGTERM` on every deploy, 2026-11-03); and a line that
 * names a lower level (`namesLowerLevel`).
 */
export function errorGroups(lines: { line: LogLine; replacedAt: string | null }[], top = 20) {
  const groups = new Map<string, { message: string; count: number; first: string; last: string }>();
  let shutdown = 0;
  let lower = 0;
  for (const { line, replacedAt } of lines) {
    if (replacedAt && Date.parse(line.timestamp) >= Date.parse(replacedAt)) {
      shutdown++;
      continue;
    }
    if (namesLowerLevel(line.message)) {
      lower++;
      continue;
    }
    const message = withoutAddresses(line.message);
    const shape = errorShape(message);
    const g = groups.get(shape) ?? { message: message.slice(0, 200), count: 0, first: line.timestamp, last: line.timestamp };
    g.count++;
    if (line.timestamp < g.first) g.first = line.timestamp;
    if (line.timestamp > g.last) g.last = line.timestamp;
    groups.set(shape, g);
  }
  const all = [...groups.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  return { lines: all.reduce((n, g) => n + g.count, 0), shutdown, lower, kinds: all.length, groups: all.slice(0, top) };
}

export type ServiceErrors = ReturnType<typeof errorGroups> & { deployments: number; truncated: number };

/** Warned when seen in the day before the report: older ones are in the section, not the warnings. */
export function errorsWarnings(e: Record<string, ServiceErrors>, nowMs: number): Warning[] {
  const out: Warning[] = [];
  for (const [service, s] of Object.entries(e)) {
    if (s.truncated) out.push({ at: service, warn: `${s.truncated} deployment logs hit ${RAILWAY_LOG_LIMIT} error lines: there are more than counted` });
    for (const g of s.groups.filter((x) => nowMs - Date.parse(x.last) < 864e5).slice(0, 5)) out.push({ at: service, warn: `${g.count}× since ${g.first}: ${g.message.slice(0, 120)}` });
  }
  return out;
}

/** The server's errors and crashes in the window, from Railway's log, by service. */
export function errors(o: { services: string[] }): SectionSpec<Record<string, ServiceErrors>> {
  return {
    source: `railway logs --filter @level:error, each deployment in the window (${o.services.join(', ')})`,
    windowed: true,
    title: 'Server errors',
    read: (ctx) =>
      Object.fromEntries(
        o.services.map((service) => {
          const runs = deploymentsInWindow(ctx.runJson<RailwayDeployment[]>('railway', ['deployment', 'list', '-s', service, '--json'], []), ctx.now);
          const lines: { line: LogLine; replacedAt: string | null }[] = [];
          let truncated = 0;
          for (const d of runs) {
            const since = new Date(Math.max(Date.parse(d.from), start(ctx.now))).toISOString();
            const until = new Date(Math.min(d.replacedAt ? Date.parse(d.replacedAt) + 3_600_000 : Date.now(), end(ctx.now))).toISOString();
            const out = ctx.run('railway', ['logs', d.id, '-s', service, '--since', since, '--until', until, '-n', String(RAILWAY_LOG_LIMIT), '--json', '--filter', '@level:error']);
            const got = out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as LogLine);
            if (got.length >= RAILWAY_LOG_LIMIT) truncated++;
            for (const line of got) lines.push({ line, replacedAt: d.replacedAt });
          }
          return [service, { deployments: runs.length, truncated, ...errorGroups(lines) }];
        }),
      ),
    warnings: (e) => errorsWarnings(e, Date.now()),
    text: (e) =>
      Object.entries(e).flatMap(([service, s]) => [
        `${service}: ${s.lines} error lines of ${s.kinds} kinds, from ${s.deployments} deployments${s.shutdown || s.lower ? ` (set apart: ${s.shutdown} as replaced ones shut down, ${s.lower} naming a lower level)` : ''}${s.truncated ? `; ${s.truncated} logs hit the limit` : ''}`,
        ...s.groups.slice(0, 10).map((g) => `  ${String(g.count).padStart(5)}×  last ${g.last.slice(0, 16)}  ${g.message.slice(0, 120)}`),
      ]),
  };
}

// ─── activity ──────────────────────────────────────────────────────────

/** A table to count, for `activity`. */
export interface Counted {
  /** What a row is, said plainly: "agents registered". */
  what: string;
  table: string;
  /** When a row happened; created_at when there's none. */
  column?: string;
}

/** The count in a PostgREST `content-range` header (`0-0/42`, or `*\/0`). */
export function countOf(contentRange: string | null): number {
  const n = Number(contentRange?.split('/')[1]);
  if (!Number.isFinite(n)) throw new Error(`no count in content-range "${contentRange}"`);
  return n;
}

async function countRows(url: string, key: string, t: Counted, w: Window): Promise<number> {
  const column = t.column ?? 'created_at';
  const q = `${url}/rest/v1/${t.table}?select=*&${column}=gte.${w.from}T00:00:00Z&${column}=lt.${new Date(end(w)).toISOString()}`;
  const res = await fetch(q, { method: 'HEAD', headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact', range: '0-0' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok && res.status !== 206) throw new Error(`Supabase answered ${res.status} (is ${column} a column of ${t.table}?)`);
  return countOf(res.headers.get('content-range'));
}

export interface ActivityRow {
  what: string;
  table: string;
  now: number | null;
  before: number | null;
  /** Why this table couldn't be counted; the other tables still are. */
  error?: string;
}

/**
 * What agents (or people) did in the window, counted per table from Supabase,
 * beside the window before. Counts only, never a row's contents (the standard).
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, the names the
 * Supabase projects share.
 */
export function activity(o: { tables: Counted[] }): SectionSpec<ActivityRow[]> {
  return {
    source: `Supabase, rows created in the window: ${o.tables.map((t) => t.table).join(', ')}`,
    windowed: true,
    title: 'Activity',
    read: async (ctx) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('no NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.prod');
      const rows: ActivityRow[] = [];
      for (const t of o.tables) {
        try {
          rows.push({ what: t.what, table: t.table, now: await countRows(url, key, t, ctx.now), before: await countRows(url, key, t, ctx.before) });
        } catch (e) {
          rows.push({ what: t.what, table: t.table, now: null, before: null, error: oneLine(e) });
        }
      }
      return rows;
    },
    warnings: (rows) => [
      ...rows.filter((r) => r.error).map((r) => ({ at: r.table, warn: `couldn't count: ${r.error}` })),
      ...rows.filter((r) => r.now === 0 && (r.before ?? 0) > 0).map((r) => ({ at: r.table, warn: `none in the window: ${r.what}, ${r.before} the window before` })),
    ],
    text: (rows) => rows.map((r) => (r.error ? `     ?  ${r.what} (couldn't count: ${r.error})` : `${String(r.now).padStart(6)}  ${r.what} (before: ${r.before})`)),
  };
}

// ─── search.bing ───────────────────────────────────────────────────────

/** A Bing date, `/Date(1793232000000)/` or with an offset, as a UTC day. */
export function bingDay(d: string): string {
  const ms = Number(/-?\d+/.exec(d ?? '')?.[0]);
  if (!Number.isFinite(ms)) throw new Error(`not a Bing date: "${d}"`);
  return new Date(ms).toISOString().slice(0, 10);
}

const inDays = (day: string, w: Window) => day >= w.from && day <= w.to;

export interface BingStatRow {
  Query: string;
  Date: string;
  Clicks: number;
  Impressions: number;
  AvgImpressionPosition?: number;
}

export interface BingRow {
  key: string;
  impressions: number;
  clicks: number;
  /** Bing's average position, weighted by impressions; null with none. */
  position: number | null;
}

/**
 * Bing's query or page stats, a row per key per week, summed over the rows
 * dated in the window. Bing keeps months of them, so a sum over every row
 * (church's first version) counts far more than the window.
 */
export function bingRows(list: BingStatRow[], w: Window, top = 25): BingRow[] {
  const by = new Map<string, { key: string; impressions: number; clicks: number; weighted: number }>();
  for (const r of list) {
    if (!inDays(bingDay(r.Date), w)) continue;
    const key = String(r.Query ?? '').trim();
    const t = by.get(key) ?? { key, impressions: 0, clicks: 0, weighted: 0 };
    t.impressions += r.Impressions || 0;
    t.clicks += r.Clicks || 0;
    if ((r.AvgImpressionPosition ?? 0) > 0) t.weighted += r.AvgImpressionPosition! * (r.Impressions || 0);
    by.set(key, t);
  }
  return [...by.values()]
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.key.localeCompare(b.key))
    .slice(0, top)
    .map(({ weighted, ...t }) => ({ ...t, position: t.impressions && weighted ? Math.round((weighted / t.impressions) * 10) / 10 : null }));
}

export interface BingTraffic {
  impressions: number;
  clicks: number;
}

/** The site's daily impressions and clicks (GetRankAndTrafficStats), summed over a window. */
export function bingTraffic(list: { Date: string; Impressions: number; Clicks: number }[], w: Window): BingTraffic {
  const t = { impressions: 0, clicks: 0 };
  for (const r of list) if (inDays(bingDay(r.Date), w)) {
    t.impressions += r.Impressions || 0;
    t.clicks += r.Clicks || 0;
  }
  return t;
}

export interface BingCrawlRow {
  Date: string;
  CrawledPages: number;
  InIndex: number;
  CrawlErrors: number;
  BlockedByRobotsTxt: number;
  Code2xx: number;
  Code4xx: number;
  Code5xx: number;
  AllOtherCodes: number;
}

export interface BingCrawl {
  /** Bing's newest crawl day, and the pages in its index then. */
  through: string | null;
  inIndex: number | null;
  /** Summed over the window's days. */
  crawled: number;
  errors: number;
  blockedByRobots: number;
  code4xx: number;
  code5xx: number;
  otherCodes: number;
}

/** Bing's crawl (GetCrawlStats): its index now, and what it crawled in the window. */
export function bingCrawl(list: BingCrawlRow[], w: Window): BingCrawl {
  const days = list.map((r) => ({ ...r, day: bingDay(r.Date) })).sort((a, b) => a.day.localeCompare(b.day));
  const last = days.at(-1);
  const c: BingCrawl = { through: last?.day ?? null, inIndex: last ? last.InIndex : null, crawled: 0, errors: 0, blockedByRobots: 0, code4xx: 0, code5xx: 0, otherCodes: 0 };
  for (const r of days) if (inDays(r.day, w)) {
    c.crawled += r.CrawledPages || 0;
    c.errors += r.CrawlErrors || 0;
    c.blockedByRobots += r.BlockedByRobotsTxt || 0;
    c.code4xx += r.Code4xx || 0;
    c.code5xx += r.Code5xx || 0;
    c.otherCodes += r.AllOtherCodes || 0;
  }
  return c;
}

export interface BingSitemap {
  url: string;
  status: string;
  submitted: string | null;
  lastCrawled: string | null;
  urls: number | null;
}

export interface Bing {
  /** Bing's newest traffic day: it lags a few days. */
  through: string | null;
  /** The windows its numbers cover: the report's, moved back to end on `through` (`bingWindows`). */
  windows: { now: Window; before: Window };
  now: BingTraffic;
  before: BingTraffic;
  queries: BingRow[];
  pages: BingRow[];
  crawl: BingCrawl;
  sitemaps: BingSitemap[];
}

/** How many days a sitemap may go unread by Bing before it's a warning. */
export const BING_SITEMAP_DAYS = 14;

export function bingWarnings(b: Bing, today: string): Warning[] {
  const out: Warning[] = [];
  if (b.crawl.inIndex === 0) out.push({ at: 'crawl', warn: `Bing has no page in its index (its crawl data through ${b.crawl.through})` });
  if (b.crawl.code5xx) out.push({ at: 'crawl', warn: `${b.crawl.code5xx} 5xx answers to Bing's crawler in the window` });
  if (!b.sitemaps.length) out.push({ at: 'sitemaps', warn: 'no sitemap submitted to Bing' });
  for (const s of b.sitemaps) {
    const age = s.lastCrawled ? Math.round((Date.parse(today) - Date.parse(s.lastCrawled)) / 864e5) : null;
    if (age === null || age > BING_SITEMAP_DAYS) out.push({ at: 'sitemaps', warn: `${s.url} last read by Bing ${s.lastCrawled ?? 'never'}${s.urls !== null ? ` (${s.urls} URLs then)` : ''}` });
  }
  return out;
}

export function bingText(b: Bing): string[] {
  const rows = (xs: BingRow[]) => xs.slice(0, 15).map((r) => `${r.key.replace(/^https?:\/\/[^/]+/, '') || '/'} ${r.impressions}/${r.clicks}/${r.position ?? '–'}`).join(', ') || 'none';
  return [
    `${b.windows.now.from} to ${b.windows.now.to} (Bing's data through ${b.through ?? 'no day yet'}): ${b.now.impressions} impressions, ${b.now.clicks} clicks (before, ${b.windows.before.from} to ${b.windows.before.to}: ${b.before.impressions}, ${b.before.clicks})`,
    `Pages (impressions, clicks, position): ${rows(b.pages)}`,
    `Queries: ${rows(b.queries)}`,
    `Index: ${b.crawl.inIndex ?? '–'} pages (through ${b.crawl.through ?? '–'}); crawled in the window ${b.crawl.crawled}, errors ${b.crawl.errors}, 4xx ${b.crawl.code4xx}, 5xx ${b.crawl.code5xx}, other codes ${b.crawl.otherCodes}, blocked by robots.txt ${b.crawl.blockedByRobots}`,
    `Sitemaps: ${b.sitemaps.map((s) => `${s.url} ${s.status}, read ${s.lastCrawled ?? 'never'}, ${s.urls ?? '?'} URLs`).join('; ') || 'none'}`,
  ];
}

/**
 * The report's windows moved back to end on Bing's newest day, as
 * `search.google` lags its own. Unmoved, `now` held only the days Bing had
 * (4 of 7 on 2026-11-04) against a whole `before`: Bing's impressions read as
 * down 31% (721 to 1,039) the week they doubled (1,370 to 679; ollamaherd).
 */
export function bingWindows(through: string | null, now: Window, before: Window): { now: Window; before: Window } {
  if (!through || through >= now.to) return { now, before };
  const days = Math.round((Date.parse(`${now.to}T00:00:00Z`) - Date.parse(`${through}T00:00:00Z`)) / 864e5);
  return { now: lagged(now, days), before: lagged(before, days) };
}

/**
 * Bing Webmaster's numbers for the site: traffic, queries, pages, its crawl and
 * index, and the sitemaps it reads. Reads BING_WEBMASTER_API_KEY (one key covers
 * every site in the account), never printed. `site` is the property as Bing
 * lists it, https://host/.
 */
export async function readBing(site: string, key: string, now: Window, before: Window): Promise<Bing> {
  const call = async <T>(method: string): Promise<T[]> => {
    const res = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/${method}?siteUrl=${encodeURIComponent(site)}&apikey=${key}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Bing's ${method} answered ${res.status}`);
    return ((await res.json()) as { d?: T[] | null }).d ?? [];
  };
  const traffic = await call<{ Date: string; Impressions: number; Clicks: number }>('GetRankAndTrafficStats');
  const feeds = await call<{ Url: string; Status: string; Submitted?: string; LastCrawled?: string; UrlCount?: number }>('GetFeeds');
  const day = (d?: string) => (d ? bingDay(d) : null);
  const through = traffic.map((r) => bingDay(r.Date)).sort().at(-1) ?? null;
  const windows = bingWindows(through, now, before);
  return {
    through,
    windows,
    now: bingTraffic(traffic, windows.now),
    before: bingTraffic(traffic, windows.before),
    queries: bingRows(await call<BingStatRow>('GetQueryStats'), windows.now),
    pages: bingRows(await call<BingStatRow>('GetPageStats'), windows.now),
    crawl: bingCrawl(await call<BingCrawlRow>('GetCrawlStats'), windows.now),
    sitemaps: feeds.map((f) => ({ url: f.Url, status: f.Status, submitted: day(f.Submitted), lastCrawled: day(f.LastCrawled), urls: f.UrlCount ?? null })),
  };
}

/** `search.bing`, the standard's section. */
export function searchBing(): SectionSpec<Bing> {
  return {
    source: 'Bing Webmaster API: traffic, query and page stats, crawl stats, sitemaps; its data lags a few days (see `through`)',
    windowed: true,
    title: 'Bing',
    read: (ctx) => {
      const key = process.env.BING_WEBMASTER_API_KEY;
      if (!key) throw new Error('no BING_WEBMASTER_API_KEY in .env (Bing Webmaster Tools, Settings, API access)');
      return readBing(`${ctx.site.replace(/\/$/, '')}/`, key, ctx.now, ctx.before);
    },
    warnings: (b) => bingWarnings(b, new Date().toISOString().slice(0, 10)),
    text: bingText,
  };
}

// ─── search.google ─────────────────────────────────────────────────────

/** Search Console's data lags about this many days, so its windows end that far back. */
export const SC_LAG_DAYS = 3;

/** A window moved back by Search Console's lag, keeping its length. */
export function lagged(w: Window, days = SC_LAG_DAYS): Window {
  const back = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10);
  return { from: back(w.from), to: back(w.to) };
}

/** A row of Search Console's searchAnalytics. */
export interface ScApiRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ScRow {
  /** The query, or the page's path; for queries by page, the query. */
  key: string;
  /** For queries by page: the page's path. */
  page?: string;
  clicks: number;
  impressions: number;
  /** Percent, one decimal. */
  ctr: number;
  position: number;
}

export interface ScTotals {
  clicks: number;
  impressions: number;
  position: number | null;
}

export interface SearchGoogle {
  property: string;
  /** The windows asked for, each moved back by the lag: Search Console's data ends about then. */
  now: Window;
  before: Window;
  totals: { now: ScTotals; before: ScTotals };
  queries: ScRow[];
  pages: ScRow[];
  /** Each page's queries, the busiest pairs first: where a title misses its searchers' words. */
  queriesByPage: ScRow[];
}

const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/';

/** API rows as the report keeps them, the most impressions first: paths not URLs, ctr in percent, position to one decimal. */
export function scRows(rows: ScApiRow[], dims: string[]): ScRow[] {
  return rows.map((r) => {
    const k = (d: string) => r.keys?.[dims.indexOf(d)] ?? '';
    const out: ScRow = {
      key: dims.includes('query') ? k('query') : pathOf(k('page')),
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    };
    if (dims.includes('query') && dims.includes('page')) out.page = pathOf(k('page'));
    return out;
  }).sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}

/** A query with no dimensions answers one row of totals, or none when there were no impressions. */
export function scTotals(rows: ScApiRow[]): ScTotals {
  const r = rows[0];
  return r ? { clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 } : { clicks: 0, impressions: 0, position: null };
}

export function searchGoogleWarnings(g: SearchGoogle): Warning[] {
  const { now, before } = g.totals;
  if (now.impressions === 0 && before.impressions > 0) return [{ at: '', warn: `no impressions ${g.now.from} to ${g.now.to}, ${before.impressions} the window before` }];
  if (before.impressions >= 100 && now.impressions < before.impressions / 2) return [{ at: '', warn: `impressions halved: ${now.impressions}, ${before.impressions} the window before` }];
  return [];
}

export function searchGoogleText(g: SearchGoogle): string[] {
  const t = (x: ScTotals) => `${x.impressions} impressions, ${x.clicks} clicks, position ${x.position ?? '–'}`;
  // A query can be a whole pasted prompt (2026-11-03: 700 characters).
  const short = (q: string) => (q.length > 60 ? `${q.slice(0, 57)}...` : q);
  const rows = (xs: ScRow[]) => xs.slice(0, 15).map((r) => `${short(r.key)} ${r.impressions}/${r.clicks}/${r.position}`).join(', ') || 'none';
  return [
    `${g.property}, ${g.now.from} to ${g.now.to}: ${t(g.totals.now)} (before: ${t(g.totals.before)})`,
    `Pages (impressions, clicks, position): ${rows(g.pages)}`,
    `Queries: ${rows(g.queries)}`,
    `Queries by page: ${g.queriesByPage.slice(0, 10).map((r) => `${r.page} "${short(r.key)}" ${r.impressions}/${r.clicks}/${r.position}`).join(', ') || 'none'}`,
  ];
}

/** Search Console's numbers for a property, with an OAuth access token. */
export async function readSearchGoogle(property: string, token: string, now: Window, before: Window): Promise<SearchGoogle> {
  const query = async (w: Window, dimensions: string[], rowLimit: number): Promise<ScApiRow[]> => {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: w.from, endDate: w.to, dimensions, rowLimit }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as { rows?: ScApiRow[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`Search Console answered ${res.status}: ${body.error?.message ?? ''}`);
    return body.rows ?? [];
  };
  const [n, b] = [lagged(now), lagged(before)];
  return {
    property,
    now: n,
    before: b,
    totals: { now: scTotals(await query(n, [], 1)), before: scTotals(await query(b, [], 1)) },
    queries: scRows(await query(n, ['query'], 25), ['query']),
    pages: scRows(await query(n, ['page'], 25), ['page']),
    queriesByPage: scRows(await query(n, ['page', 'query'], 50), ['page', 'query']),
  };
}

/**
 * `search.google`, the standard's section: totals beside the window before,
 * queries, pages, and queries by page, each window moved back by Search
 * Console's lag. Reads GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and
 * SEARCH_CONSOLE_REFRESH_TOKEN (read-only), never printed. The property is
 * sc-domain:<host> unless the project names another. `indexing` isn't here yet.
 */
export function searchGoogle(o: { property?: string } = {}): SectionSpec<SearchGoogle> {
  return {
    source: `Search Console searchAnalytics; its data lags about ${SC_LAG_DAYS} days, so the windows end then`,
    windowed: true,
    title: 'Google',
    read: async (ctx) => {
      const { GOOGLE_OAUTH_CLIENT_ID: id, GOOGLE_OAUTH_CLIENT_SECRET: secret, SEARCH_CONSOLE_REFRESH_TOKEN: refresh } = process.env;
      if (!id || !secret || !refresh) throw new Error('no GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET or SEARCH_CONSOLE_REFRESH_TOKEN in .env');
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
        signal: AbortSignal.timeout(30_000),
      });
      const token = ((await res.json()) as { access_token?: string }).access_token;
      if (!token) throw new Error(`Google's token endpoint answered ${res.status} with no access token`);
      return readSearchGoogle(o.property ?? `sc-domain:${new URL(ctx.site).hostname}`, token, ctx.now, ctx.before);
    },
    warnings: searchGoogleWarnings,
    text: searchGoogleText,
  };
}

// ─── cloudflare ────────────────────────────────────────────────────────

/** A row of Cloudflare's `httpRequestsAdaptiveGroups`. */
export interface CfRow {
  count: number;
  avg?: { sampleInterval: number };
  dimensions: Record<string, string | number>;
}

/** Rows past this many weren't returned: the counts are a floor. */
export const CF_LIMIT = 1000;

/**
 * A path no site of ours serves, asked for by scanners: dotfiles and their
 * backups, PHP and WordPress, admin consoles. Counted, not listed, so a real
 * broken link stands out among the 404s. A project can pass its own.
 */
export const isProbePath = (path: string) =>
  /(^|\/)\.(env|git|svn|hg|aws|ssh|docker|vscode|idea|claude|DS_Store|npmrc|htaccess|htpasswd)|\.(php\d?|aspx?|jsp|cgi|sql|bak|old|swp|tar|gz|zip|7z|rar)$|(^|\/)(wp-|wordpress|phpmyadmin|actuator|cgi-bin|xmlrpc|vendor\/|admin\/|server-status|credentials|secrets?\.)|(^|\/)(config|env|settings|appsettings)\.(js|json|ya?ml)$/i.test(path);

/** Rows summed by one dimension, most first. */
export function cfBy(rows: CfRow[], dim: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.dimensions[dim])] = (out[String(r.dimensions[dim])] ?? 0) + r.count;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/** 5xx rows (hour, path, status) by hour and by path; the busiest path first. */
export function cfServerErrors(rows: CfRow[], limit = CF_LIMIT) {
  const byHour = new Map<string, { hour: string; n: number; statuses: Record<string, number> }>();
  const byPath = new Map<string, { status: number; path: string; n: number }>();
  for (const { count, dimensions: d } of rows) {
    const hour = String(d.datetimeHour).slice(0, 13);
    const h = byHour.get(hour) ?? { hour, n: 0, statuses: {} };
    h.n += count;
    const status = String(d.edgeResponseStatus);
    h.statuses[status] = (h.statuses[status] ?? 0) + count;
    byHour.set(hour, h);
    const key = `${d.edgeResponseStatus} ${d.clientRequestPath}`;
    const p = byPath.get(key) ?? { status: Number(d.edgeResponseStatus), path: String(d.clientRequestPath), n: 0 };
    p.n += count;
    byPath.set(key, p);
  }
  return {
    total: rows.reduce((n, r) => n + r.count, 0),
    byHour: [...byHour.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
    byPath: [...byPath.values()].sort((a, b) => b.n - a.n),
    truncated: rows.length >= limit,
  };
}

/** 404 rows by path: the site-shaped ones listed, the probes counted. */
export function cfNotFound(rows: CfRow[], isProbe = isProbePath, top = 20) {
  let probes = 0;
  const site: { path: string; n: number }[] = [];
  for (const [path, n] of Object.entries(cfBy(rows, 'clientRequestPath'))) {
    if (isProbe(path)) probes += n;
    else site.push({ path, n });
  }
  return { total: rows.reduce((n, r) => n + r.count, 0), probes, site: site.slice(0, top), truncated: rows.length >= CF_LIMIT };
}

export interface Cloudflare {
  /** Each query's largest sample interval: at 1 its counts are exact (the standard). */
  sampleInterval: { statuses: number; serverErrors: number; notFound: number; devices: number };
  now: { requests: number; statuses: Record<string, number> };
  before: { requests: number; statuses: Record<string, number> };
  serverErrors: ReturnType<typeof cfServerErrors>;
  notFound: ReturnType<typeof cfNotFound>;
  /** HTML pages answered 200, by the client's device type. */
  devices: Record<string, number>;
}

/** Warned: 5xx in the last day (by hour), an hour of 10 or more, and lists cut at the limit. */
export function cloudflareWarnings(c: Cloudflare, nowMs: number): Warning[] {
  const out: Warning[] = [];
  const recent = c.serverErrors.byHour.filter((h) => nowMs - Date.parse(`${h.hour}:00:00Z`) < 864e5 + 3_600_000);
  if (recent.length) out.push({ at: 'serverErrors', warn: `${recent.reduce((n, h) => n + h.n, 0)} 5xx in the last day: ${recent.map((h) => `${h.hour.slice(5)}h ${h.n} (${Object.keys(h.statuses).join(', ')})`).join(', ')}` });
  for (const h of c.serverErrors.byHour.filter((x) => x.n >= 10 && !recent.includes(x))) out.push({ at: 'serverErrors', warn: `${h.n} 5xx in the hour from ${h.hour}:00Z` });
  if (c.serverErrors.truncated) out.push({ at: 'serverErrors', warn: `${CF_LIMIT} rows: there are more 5xx than counted` });
  if (c.sampleInterval.serverErrors > 1) out.push({ at: 'serverErrors', warn: `sampled (interval ${c.sampleInterval.serverErrors}): the 5xx counts are estimates` });
  return out;
}

export function cloudflareText(c: Cloudflare): string[] {
  // Numeric keys (statuses) keep JS's ascending order in an object, so sort here.
  const top = (r: Record<string, number>, n = 8) => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');
  const sampled = Object.entries(c.sampleInterval).map(([k, v]) => [k, Math.round(v * 10) / 10] as const).filter(([, v]) => v > 1).map(([k, v]) => `${k} ${v}`);
  const nf = c.notFound;
  return [
    `Requests: ${c.now.requests} (before: ${c.before.requests}); ${top(c.now.statuses)}`,
    `5xx: ${c.serverErrors.total}${c.serverErrors.byHour.length ? `, in ${c.serverErrors.byHour.length} hours: ${c.serverErrors.byHour.map((h) => `${h.hour.slice(5)}h ${h.n}`).join(', ')}` : ''}`,
    ...c.serverErrors.byPath.slice(0, 5).map((p) => `  ${String(p.n).padStart(5)}×  ${p.status} ${p.path}`),
    // At the row limit the by-path rows are only the most-asked paths, so the total comes from the statuses.
    `404s: ${nf.truncated ? `${c.now.statuses['404'] ?? nf.total}; in the ${CF_LIMIT} most-asked paths, ${nf.probes} were scanners' probes` : `${nf.total}, ${nf.probes} of them scanners' probes`}; the rest by path: ${nf.site.slice(0, 10).map((p) => `${p.path} ${p.n}`).join(', ') || 'none'}`,
    `Pages by device: ${top(c.devices)}`,
    ...(sampled.length ? [`Sampled, so estimates (interval): ${sampled.join(', ')}`] : []),
  ];
}

async function cfQuery(token: string, query: string, variables: Record<string, unknown>): Promise<CfRow[]> {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json()) as { data?: { viewer: { zones: { rows: CfRow[] }[] } }; errors?: { message: string }[] | null };
  if (!res.ok || body.errors?.length || !body.data) throw new Error(`Cloudflare GraphQL answered ${res.status}: ${body.errors?.map((e) => e.message).join('; ') ?? ''}`);
  return body.data.viewer.zones[0]?.rows ?? [];
}

/** One query's rows: `dims` grouped, `filter` added to the window's, people and crawlers only (eyeball). */
const cfGroups = (dims: string, filter: string, byTime = false) => `query ($zone: String!, $from: ${byTime ? 'Time' : 'Date'}!, $to: ${byTime ? 'Time' : 'Date'}!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    rows: httpRequestsAdaptiveGroups(limit: ${CF_LIMIT}, orderBy: [count_DESC], filter: { ${byTime ? 'datetime_geq: $from, datetime_lt: $to' : 'date_geq: $from, date_leq: $to'}, requestSource: "eyeball"${filter ? `, ${filter}` : ''} }) {
      count avg { sampleInterval } dimensions { ${dims} }
    }
  } }
}`;

/**
 * `cloudflare`, the standard's section: requests by status beside the window
 * before, 5xx by hour and path in a query of their own (404 rows filled a shared
 * row limit and hid 40% of them, church 2026-11-02; a week's total hid a
 * 75-minute outage), 404s with the probes set apart, and pages by device.
 * Reads CLOUDFLARE_API_TOKEN (Zone Analytics Read) and CLOUDFLARE_ZONE_ID, never
 * printed. 5xx here include the edge's own (522: the origin didn't answer),
 * which the host's log never sees.
 */
export function cloudflare(o: { isProbe?: (path: string) => boolean } = {}): SectionSpec<Cloudflare> {
  return {
    source: "Cloudflare GraphQL, httpRequestsAdaptiveGroups, the zone's eyeball requests",
    windowed: true,
    title: 'Cloudflare',
    read: async (ctx) => {
      const token = process.env.CLOUDFLARE_API_TOKEN;
      const zone = process.env.CLOUDFLARE_ZONE_ID;
      if (!token || !zone) throw new Error('no CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID in .env.prod (a read-only Analytics token)');
      const days = (w: Window) => ({ zone, from: w.from, to: w.to });
      const statusNow = await cfQuery(token, cfGroups('edgeResponseStatus', ''), days(ctx.now));
      const statusBefore = await cfQuery(token, cfGroups('edgeResponseStatus', ''), days(ctx.before));
      const fiveXx = await cfQuery(token, cfGroups('datetimeHour clientRequestPath edgeResponseStatus', 'edgeResponseStatus_geq: 500', true), { zone, from: new Date(start(ctx.now)).toISOString(), to: new Date(end(ctx.now)).toISOString() });
      const notFound = await cfQuery(token, cfGroups('clientRequestPath', 'edgeResponseStatus: 404'), days(ctx.now));
      const devices = await cfQuery(token, cfGroups('clientDeviceType', 'edgeResponseStatus: 200, edgeResponseContentTypeName: "html"'), days(ctx.now));
      const sum = (rows: CfRow[]) => rows.reduce((n, r) => n + r.count, 0);
      const interval = (...rows: CfRow[][]) => Math.max(1, ...rows.flat().map((r) => r.avg?.sampleInterval ?? 1));
      return {
        sampleInterval: { statuses: interval(statusNow, statusBefore), serverErrors: interval(fiveXx), notFound: interval(notFound), devices: interval(devices) },
        now: { requests: sum(statusNow), statuses: cfBy(statusNow, 'edgeResponseStatus') },
        before: { requests: sum(statusBefore), statuses: cfBy(statusBefore, 'edgeResponseStatus') },
        serverErrors: cfServerErrors(fiveXx),
        notFound: cfNotFound(notFound, o.isProbe),
        devices: cfBy(devices, 'clientDeviceType'),
      };
    },
    warnings: (c) => cloudflareWarnings(c, Date.now()),
    text: cloudflareText,
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
