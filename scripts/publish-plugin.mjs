#!/usr/bin/env node

/**
 * publish-plugin.mjs
 *
 * Publishes the plugins/inbed-dating bundle plugin to ClawHub as one explicit
 * account, with the same guarantees as publish-skills.mjs:
 *   - --account is required; the token comes from skills/.env through a
 *     private temp config, never your global `clawhub login`
 *   - skills/owners.json "packages" says which account owns the package; the
 *     run refuses if the token's handle (whoami) isn't that owner
 *
 * Before publishing it runs `node scripts/plugin-bundle.mjs check` (skill copy,
 * manifest versions, MCP server pin) and the ClawHub Plugin Inspector. The
 * release is source-linked to the current commit, which must already be on
 * origin/main so ClawHub can link it.
 *
 * Usage:
 *   node scripts/publish-plugin.mjs --account inbedai --dry-run
 *   node scripts/publish-plugin.mjs --account inbedai --changelog "First release"
 *
 * Version: taken from plugins/inbed-dating/plugin.json. Bump it (and the other
 * two manifests: plugin-bundle.mjs check enforces they agree) for each release.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, CLI, setUpAccount, loadOwners } from './lib/clawhub-account.mjs';

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const ACCOUNT = flag('--account');
const DRY_RUN = args.includes('--dry-run');
const CHANGELOG = flag('--changelog');

const PACKAGE = 'inbed-dating';
const DISPLAY_NAME = 'inbed.ai — AI Agent Dating';
const BUNDLE_REL = 'plugins/inbed-dating';
const BUNDLE = path.join(ROOT, BUNDLE_REL);
const SOURCE_REPO = 'geeks-accelerator/in-bed-ai';
// ClawHub allows at most 5 topics per package.
const TOPICS = 'dating,ai-agents,matchmaking,compatibility,mcp';

const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1); };

function registryVersion() {
  try {
    const out = run(`${CLI} package inspect ${PACKAGE} --json`, { timeout: 120000 });
    const data = JSON.parse(out);
    return { version: data.package?.latestVersion ?? null, owner: data.owner?.handle ?? null };
  } catch {
    return { version: null, owner: null }; // not published yet
  }
}

function main() {
  // 1. Account and ownership
  const { handle, key } = setUpAccount(ACCOUNT);
  const owner = loadOwners().packages?.[PACKAGE];
  if (!owner) fail(`${PACKAGE} has no owner in skills/owners.json "packages".`);
  if (owner !== handle) fail(`${PACKAGE} is owned by @${owner} per skills/owners.json, but ${key} is @${handle}.`);

  const version = JSON.parse(fs.readFileSync(path.join(BUNDLE, 'plugin.json'), 'utf-8')).version;
  console.log(`\n🦞 ${PACKAGE} v${version} as @${handle}${DRY_RUN ? ' (dry run)' : ''}`);

  // 2. Bundle consistency and the Plugin Inspector
  try {
    console.log(run('node scripts/plugin-bundle.mjs check').trim());
  } catch (err) {
    fail(`Bundle check failed:\n${err.stderr || err.stdout}`);
  }
  try {
    const out = run(`${CLI} package validate .`, { cwd: BUNDLE, timeout: 300000 });
    console.log(out.trim().split('\n').filter((l) => /Plugin Inspector|Breakages|Warnings|Findings/.test(l)).join('\n'));
  } catch (err) {
    fail(`Plugin Inspector failed:\n${err.stdout || ''}${err.stderr || ''}`);
  } finally {
    fs.rmSync(path.join(BUNDLE, 'reports'), { recursive: true, force: true });
  }

  // 3. Registry: ownership of an existing listing, and a new version
  const live = registryVersion();
  if (live.owner && live.owner !== handle) fail(`${PACKAGE} is already listed under @${live.owner}, not @${handle}.`);
  if (live.version === version) fail(`v${version} is already live. Bump the version in the three manifests first.`);
  console.log(`Registry: ${live.version ? `v${live.version} live` : 'not published yet'} → v${version}`);

  // 4. Source link: the bundle must be committed and the commit on origin/main
  const dirty = run(`git status --porcelain -- ${BUNDLE_REL}`).trim();
  const commit = run('git rev-parse HEAD').trim();
  let pushed = false;
  try {
    run('git fetch --quiet origin main');
    pushed = run(`git branch -r --contains ${commit}`).includes('origin/main');
  } catch { /* treated as not pushed */ }
  if (dirty || !pushed) {
    const why = dirty ? `uncommitted changes in ${BUNDLE_REL}` : `commit ${commit.slice(0, 7)} isn't on origin/main`;
    if (!DRY_RUN) fail(`Can't source-link the release: ${why}. Commit and push first.`);
    console.log(`⚠ Would refuse to publish: ${why}.`);
  }

  // 5. Publish
  const cmd = [
    CLI, 'package publish', BUNDLE_REL,
    '--family bundle-plugin',
    `--name ${PACKAGE}`,
    `--display-name ${JSON.stringify(DISPLAY_NAME)}`,
    `--owner ${handle}`,
    `--version ${version}`,
    `--topics ${TOPICS}`,
    `--source-repo ${SOURCE_REPO}`,
    `--source-commit ${commit}`,
    '--source-ref main',
    `--source-path ${BUNDLE_REL}`,
    ...(CHANGELOG ? [`--changelog ${JSON.stringify(CHANGELOG)}`] : []),
    ...(DRY_RUN ? ['--dry-run'] : ['--wait', '--wait-timeout 900']),
  ].join(' ');
  console.log(`\n$ ${cmd.replace(CLI, 'clawhub')}\n`);
  try {
    console.log(run(cmd, { timeout: 1000000 }).trim());
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`;
    // The upload succeeded and ClawHub's security scan is still running. The
    // release goes public (or is held) on its own; recheck later.
    if (/still pending/i.test(out)) {
      console.log(`\n🕓 Submitted v${version}. Still pending ClawHub security scans after the wait timeout; it goes public on its own. Recheck: clawhub package inspect ${PACKAGE}`);
      return;
    }
    fail(`Publish failed:\n${out}`);
  }
  if (!DRY_RUN) console.log(`\n✔ Published. Install: openclaw plugins install clawhub:${PACKAGE}`);
}

main();
