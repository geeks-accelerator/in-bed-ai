/**
 * Authenticate the clawhub CLI as one explicit ClawHub account, for this
 * process only. Shared by publish-skills.mjs and publish-plugin.mjs.
 *
 * The token comes from CLAWHUB_TOKEN_<ACCOUNT> in skills/.env and is handed to
 * the CLI through a private temporary config (CLAWHUB_CONFIG_PATH), so a run
 * can never publish as whoever is logged in globally. Returns the handle the
 * token belongs to (whoami); callers scope their work to what that handle owns
 * per skills/owners.json. Publishing from an account that doesn't own an item
 * got an account banned once.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = path.join(ROOT, 'skills', '.env');
export const OWNERS_FILE = path.join(ROOT, 'skills', 'owners.json');
export const REGISTRY = 'https://clawhub.ai';
export const CLI = 'npx -y clawhub@latest';

export function setUpAccount(account) {
  if (!account) {
    console.error('Missing --account. Pick the ClawHub account to publish as, e.g. --account inbedai');
    console.error('(reads CLAWHUB_TOKEN_<ACCOUNT> from skills/.env)');
    process.exit(1);
  }
  const key = `CLAWHUB_TOKEN_${account.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
  const match = env.match(new RegExp(`^${key}=["']?([^"'\\s]+)`, 'm'));
  if (!match) {
    console.error(`No ${key} in ${ENV_FILE}.`);
    process.exit(1);
  }

  // The CLI has no token env var, but it honors CLAWHUB_CONFIG_PATH. A private
  // temp config means this run can't publish as whoever is logged in globally.
  const configPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clawhub-')), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ registry: REGISTRY, token: match[1] }), { mode: 0o600 });
  process.env.CLAWHUB_CONFIG_PATH = configPath;
  process.on('exit', () => fs.rmSync(path.dirname(configPath), { recursive: true, force: true }));

  let handle = null;
  try {
    const out = execSync(`${CLI} whoami --no-input 2>&1`, { encoding: 'utf-8', timeout: 60000 });
    // Interactive output is "✔ handle"; piped output is just "handle".
    const last = out.trim().split('\n').pop() || '';
    handle = last.replace(/^[^A-Za-z0-9_-]+/, '').trim().split(/\s+/)[0] || null;
  } catch { /* handled below */ }
  if (!handle) {
    console.error(`${key} did not authenticate (clawhub whoami failed).`);
    process.exit(1);
  }
  return { handle, key };
}

export function loadOwners() {
  return JSON.parse(fs.readFileSync(OWNERS_FILE, 'utf-8'));
}
