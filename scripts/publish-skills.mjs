#!/usr/bin/env node

/**
 * publish-skills.mjs
 *
 * Publishes skills/<slug>/SKILL.md to ClawHub, one account per run.
 * Adapted from ai-animal-house/scripts/publish-skills.js.
 *
 * Our skills are spread across several ClawHub accounts (inbedai,
 * lucasgeeksinthewood, twinsgeeks, liveneon, buystsuff). Publishing a skill
 * from an account that doesn't own it got an account banned once, so:
 *   - skills/owners.json says which account owns each skill (source of truth,
 *     generated from the live registry); a run only touches skills owned by
 *     the account it runs as, and never skills missing from owners.json
 *   - --account is required; the token comes from CLAWHUB_TOKEN_<ACCOUNT> in
 *     skills/.env and is handed to the CLI through a temporary config file
 *     (CLAWHUB_CONFIG_PATH), never touching your global `clawhub login`
 *   - the handle the token belongs to (whoami) decides which skills are in scope,
     and is the account the CLI publishes as
 *   - registry state is read per owner (GET /api/v1/skills/<slug>?owner=<handle>),
 *     because `clawhub inspect <slug>` is ambiguous when other publishers use
 *     the same slug (e.g. crush, social)
 *
 * Other differences from the animal-house script:
 *   - Updates keep the live display name (they're keyword-tuned, e.g.
 *     "Dating Platform. 约会。Citas."); new skills use the SKILL.md H1 or --name.
 *   - SKILL.md files carry no version: an update publishes the next patch
 *     above the live version (or --version); a new skill starts at 1.0.0.
 *   - A skill whose content already matches the live version is skipped.
 *
 * Rate limit: ClawHub allows max 5 NEW skills per hour (updates don't count).
 * Spam detection errors are distinguished from rate limits and skip immediately.
 *
 * Usage:
 *   node scripts/publish-skills.mjs --account lucasgeeksinthewoods --dry-run
 *   node scripts/publish-skills.mjs --account lucasgeeksinthewoods --only dating,love,social
 *   node scripts/publish-skills.mjs --account inbedai --filter -dating --changelog "Adds spirit_animal"
 *   node scripts/publish-skills.mjs --account twinsgeeks --only spirit-animal --name "Spirit Animal. 守护灵。Animal espiritual."
 *   node scripts/publish-skills.mjs --account liveneon --force            # re-publish even if unchanged
 *
 * Flags: --account <name> (required), --dry-run, --only a,b, --filter <substr>,
 *        --version <x.y.z>, --name <display name> (new skills), --changelog <text>,
 *        --topics a,b (replaces the skill's catalog topics — e.g. to drop one ClawHub
 *        has since reserved, which otherwise blocks republishing), --force,
 *        --delay <seconds> (default 300), --skip <n>
 *
 * Requires:
 *   - skills/.env with CLAWHUB_TOKEN_<ACCOUNT>=clh_... (one per account)
 *   - npx (runs the current clawhub CLI; the old 0.7.0 global can't publish —
 *     it doesn't accept ClawHub's MIT-0 skill license)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, OWNERS_FILE, REGISTRY, CLI, setUpAccount as setUpClawhubAccount } from './lib/clawhub-account.mjs';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const ACCOUNT = flag('--account');
const VERSION_OVERRIDE = flag('--version');
const NAME_OVERRIDE = flag('--name');
const CHANGELOG = flag('--changelog');
const TOPICS = flag('--topics');
const DELAY = flag('--delay') ? parseInt(flag('--delay'), 10) : 300;
const SKIP = flag('--skip') ? parseInt(flag('--skip'), 10) : 0;
const FILTER = flag('--filter');
const ONLY = flag('--only') ? flag('--only').split(',').map((s) => s.trim()) : null;

// ---------------------------------------------------------------------------
// Paths & config
// ---------------------------------------------------------------------------
const SKILLS_DIR = path.join(ROOT, 'skills');
const HOURLY_LIMIT = 5; // ClawHub: max 5 new skills per hour
const HOURLY_COOLDOWN_SEC = 600; // 10 minutes — retry after rate limit

// ---------------------------------------------------------------------------
// Skills in scope: owned by this handle per skills/owners.json
// ---------------------------------------------------------------------------
function loadOwners() {
  return JSON.parse(fs.readFileSync(OWNERS_FILE, 'utf-8')).skills;
}

function localSkills() {
  return fs.readdirSync(SKILLS_DIR)
    .filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md')))
    .sort();
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

function nextPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '1.0.0';
}

// ---------------------------------------------------------------------------
// Registry state for <slug> as published by <handle>
// ---------------------------------------------------------------------------
async function registryState(slug, handle) {
  const res = await fetch(`${REGISTRY}/api/v1/skills/${encodeURIComponent(slug)}?owner=${encodeURIComponent(handle)}`);
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`registry lookup for ${slug} failed: HTTP ${res.status}`);
  const data = await res.json();
  if (data.owner?.handle !== handle) {
    throw new Error(`registry returned ${slug} owned by @${data.owner?.handle}, expected @${handle}`);
  }
  return {
    exists: true,
    version: data.latestVersion?.version ?? null,
    displayName: data.skill?.displayName ?? null,
    content: data.skill?.description ?? '',
  };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------
// --tags on `clawhub publish` are dist-tags (default "latest"), not search
// keywords, so frontmatter tags are not passed. No --owner: the token's account
// (verified with whoami) is the publisher.
function publishCommand(slug, displayName, version, { dryRun = false } = {}) {
  return [
    CLI,
    `--workdir "${SKILLS_DIR}"`,
    `--registry ${REGISTRY}`,
    '--no-input',
    `publish ${slug}`,
    `--slug ${slug}`,
    `--name ${JSON.stringify(displayName)}`,
    `--version ${version}`,
    CHANGELOG ? `--changelog ${JSON.stringify(CHANGELOG)}` : '',
    TOPICS ? `--topics ${JSON.stringify(TOPICS)}` : '',
    dryRun ? '--dry-run' : '--json',
  ].filter(Boolean).join(' ');
}

function countdown(seconds, label = 'Next publish') {
  return new Promise((resolve) => {
    const end = Date.now() + seconds * 1000;
    const tick = () => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining <= 0) {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        resolve();
        return;
      }
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      process.stdout.write(`\r   ⏳ ${label} in ${min > 0 ? `${min}m ${sec}s` : `${sec}s`}...   `);
      setTimeout(tick, 1000);
    };
    tick();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { handle, key } = setUpClawhubAccount(ACCOUNT);
  const owners = loadOwners();
  const local = localSkills();

  const unassigned = local.filter((s) => !owners[s]);
  let scope = local.filter((s) => owners[s] === handle);
  if (ONLY) {
    const missing = ONLY.filter((s) => owners[s] !== handle);
    if (missing.length) {
      console.error(`Not owned by @${handle} per skills/owners.json: ${missing.map((s) => `${s}${owners[s] ? ` (@${owners[s]})` : ' (unassigned)'}`).join(', ')}`);
      process.exit(1);
    }
    scope = scope.filter((s) => ONLY.includes(s));
  }
  if (FILTER) scope = scope.filter((s) => s.includes(FILTER));
  if (NAME_OVERRIDE && scope.length !== 1) {
    console.error('--name applies to a single skill; combine it with --only <slug>.');
    process.exit(1);
  }

  console.log('\n🥠 publish-skills.mjs — publish inbed.ai skills to ClawHub');
  console.log(`   Account:   @${handle} (${key})`);
  console.log(`   Registry:  ${REGISTRY}`);
  console.log(`   In scope:  ${scope.length} skill(s) owned by @${handle}`);
  if (VERSION_OVERRIDE) console.log(`   Version:   ${VERSION_OVERRIDE} (override)`);
  if (CHANGELOG) console.log(`   Changelog: ${CHANGELOG}`);
  if (FORCE) console.log('   Force:     re-publish even if unchanged');
  if (DRY_RUN) console.log('   Mode:      --dry-run (CLI dry run, nothing published)');
  if (unassigned.length) console.log(`   Not in owners.json (never published by this script): ${unassigned.join(', ')}`);
  console.log('');

  const results = { published: [], updated: [], pending: [], upToDate: [], failed: [], skipped: [] };
  let newPublishCount = 0;
  let hourWindowStart = Date.now();

  for (let i = 0; i < scope.length; i++) {
    const slug = scope[i];
    if (i < SKIP) { results.skipped.push(slug); continue; }

    const content = fs.readFileSync(path.join(SKILLS_DIR, slug, 'SKILL.md'), 'utf-8');
    const reg = await registryState(slug, handle);

    if (reg.exists && !FORCE && normalize(reg.content) === normalize(content)) {
      results.upToDate.push(slug);
      continue;
    }

    const version = VERSION_OVERRIDE || (reg.exists ? nextPatch(reg.version) : '1.0.0');
    const displayName = NAME_OVERRIDE || (reg.exists ? reg.displayName : null) || extractTitle(content) || slug;
    const action = reg.exists ? 'update' : 'publish';

    console.log(`   📦 ${slug}  ${reg.exists ? `v${reg.version} → v${version}` : `new, v${version}`}`);
    console.log(`      Name: ${displayName}`);

    if (DRY_RUN) {
      try {
        execSync(publishCommand(slug, displayName, version, { dryRun: true }),
          { encoding: 'utf-8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
        // The CLI's --dry-run only packs locally (no server-side checks); ownership
        // is guaranteed by owners.json + whoami + the per-owner registry lookup.
        console.log(`      ✓ would ${action} (local package check passed)\n`);
        (reg.exists ? results.updated : results.published).push(slug);
      } catch (err) {
        const msg = (err.stderr || err.stdout || err.message || '').trim().split('\n').pop();
        console.log(`      ❌ CLI dry run failed: ${msg}\n`);
        results.failed.push({ slug, error: msg });
      }
      continue;
    }

    // Proactive hourly limit for NEW skills
    if (!reg.exists && newPublishCount >= HOURLY_LIMIT) {
      const elapsed = Math.floor((Date.now() - hourWindowStart) / 1000);
      console.log(`\n   🕐 Hourly limit reached (${HOURLY_LIMIT} new skills). Waiting for window reset...`);
      await countdown(Math.max(HOURLY_COOLDOWN_SEC - elapsed, 60), 'Hourly window resets');
      newPublishCount = 0;
      hourWindowStart = Date.now();
    }

    let handled = false;
    for (let attempt = 0; attempt < 3 && !handled; attempt++) {
      try {
        const out = execSync(publishCommand(slug, displayName, version),
          { encoding: 'utf-8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
        // --json reports publicationStatus: "published", or "pending" when the
        // version is held for ClawHub's security scans before going public.
        let status = null;
        try { status = JSON.parse(out.slice(out.indexOf('{'))).publicationStatus ?? null; } catch { /* unparsable */ }
        if (status === 'published') {
          // Confirm the registry serves the new version under this owner
          // (it can lag the publish response by a few seconds).
          let after = null;
          for (let t = 0; t < 6; t++) {
            after = await registryState(slug, handle);
            if (after.exists && after.version === version) break;
            await new Promise((r) => setTimeout(r, 10000));
          }
          if (!after.exists || after.version !== version) {
            throw Object.assign(new Error(`registry shows ${after.exists ? `v${after.version}` : 'no skill'} ~1 min after publishing v${version}`), { stderr: '' });
          }
          console.log(`      ✅ ${action === 'update' ? 'Updated' : 'Published'} v${version}`);
          (reg.exists ? results.updated : results.published).push(slug);
        } else {
          console.log(`      🕓 Submitted v${version} — ${status === 'pending' ? 'pending ClawHub security scans before it goes public' : `publication status: ${status ?? 'not reported'}`}`);
          results.pending.push(`${slug} v${version}`);
        }
        if (!reg.exists) newPublishCount++;
        handled = true;
      } catch (err) {
        const stderr = err.stderr || err.message || '';
        const lower = stderr.toLowerCase();
        const isRateLimit = lower.includes('rate limit') || stderr.includes('429') || lower.includes('too many');
        const isSpam = lower.includes('spam') || lower.includes('repeated template');
        if (isRateLimit && !isSpam && attempt < 2) {
          const waitSec = HOURLY_COOLDOWN_SEC * (attempt + 1); // 10m, then 20m
          console.log(`      ⚠️  Rate limited (attempt ${attempt + 1}/3) — waiting ${Math.round(waitSec / 60)}m...`);
          await countdown(waitSec, 'Rate limit cooldown');
          newPublishCount = 0;
          hourWindowStart = Date.now();
          continue;
        }
        const msg = isSpam ? 'Spam detection — content too similar to other skills' : (stderr.trim().split('\n')[0] || err.message);
        console.log(`      ❌ Failed: ${msg}`);
        results.failed.push({ slug, error: msg });
        handled = true;
      }
    }

    if (i < scope.length - 1) {
      console.log('');
      await countdown(DELAY);
      console.log('');
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`📊 Summary for @${handle}`);
  console.log(`   Published (new): ${results.published.length}`);
  console.log(`   Updated:         ${results.updated.length}`);
  if (results.pending.length) console.log(`   Pending scans:   ${results.pending.length} (${results.pending.join(', ')}) — recheck later`);
  console.log(`   Up to date:      ${results.upToDate.length}`);
  console.log(`   Failed:          ${results.failed.length}`);
  if (results.skipped.length) console.log(`   Skipped (--skip): ${results.skipped.length}`);
  if (DRY_RUN) console.log('\n   (dry run — nothing published)');
  if (results.failed.length) {
    console.log('\n   Failed skills:');
    for (const f of results.failed) console.log(`     - ${f.slug}: ${f.error}`);
  }
  console.log('');
  if (results.failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nPublish script failed:', err.message);
  process.exit(1);
});
