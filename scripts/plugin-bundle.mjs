#!/usr/bin/env node
/**
 * Keeps plugins/inbed-dating/ consistent with its sources.
 *
 *   node scripts/plugin-bundle.mjs sync    # copy skills/dating/SKILL.md into the bundle
 *   node scripts/plugin-bundle.mjs check   # exit 1 on any drift (run in CI and before publishing)
 *
 * Why a copy and not a symlink: Codex drops a skill symlink that points outside
 * the plugin root (tested with codex-cli 0.146), and OpenClaw bounds-checks
 * skill paths to the plugin root. skills/dating/SKILL.md stays canonical.
 *
 * check also verifies:
 *   - the manifests agree on name and version: plugin.json (Agent Plugins:
 *     Codex, Cursor), .claude-plugin/plugin.json (Claude Code), package.json,
 *     and openclaw.plugin.json (id), which ClawHub requires to publish
 *   - all three MCP definitions launch the same server, pinned to the version
 *     in mcp-server/package.json: mcp.json (Agent Plugins), .mcp.json (Claude),
 *     and openclaw.plugin.json mcpServers. With a native manifest present,
 *     OpenClaw reads that one, not the bundle files
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'plugins', 'inbed-dating');
const SKILL_SRC = path.join(ROOT, 'skills', 'dating', 'SKILL.md');
const SKILL_DST = path.join(BUNDLE, 'skills', 'dating', 'SKILL.md');

const read = (p) => readFileSync(p, 'utf-8');
const json = (rel) => JSON.parse(read(path.join(BUNDLE, rel)));

function sync() {
  mkdirSync(path.dirname(SKILL_DST), { recursive: true });
  writeFileSync(SKILL_DST, read(SKILL_SRC));
  console.log('Synced skills/dating/SKILL.md → plugins/inbed-dating/skills/dating/SKILL.md');
}

function check() {
  const problems = [];

  let copy = null;
  try { copy = read(SKILL_DST); } catch { /* missing */ }
  if (copy !== read(SKILL_SRC)) problems.push('plugins/inbed-dating/skills/dating/SKILL.md differs from skills/dating/SKILL.md (run: node scripts/plugin-bundle.mjs sync)');

  const openclaw = json('openclaw.plugin.json');
  const manifests = {
    'plugin.json': json('plugin.json'),
    '.claude-plugin/plugin.json': json('.claude-plugin/plugin.json'),
    'package.json': json('package.json'),
    'openclaw.plugin.json': { name: openclaw.id, version: openclaw.version },
  };
  for (const field of ['name', 'version']) {
    const values = new Set(Object.values(manifests).map((m) => m[field]));
    if (values.size !== 1) problems.push(`manifests disagree on ${field}: ${Object.entries(manifests).map(([f, m]) => `${f}=${m[field]}`).join(', ')}`);
  }

  const serverVersion = JSON.parse(read(path.join(ROOT, 'mcp-server', 'package.json'))).version;
  const expected = ['-y', `mcp-inbed-dating@${serverVersion}`];
  for (const rel of ['mcp.json', '.mcp.json', 'openclaw.plugin.json']) {
    const server = json(rel).mcpServers?.inbed;
    if (!server) { problems.push(`${rel}: no "inbed" server`); continue; }
    if (server.command !== 'npx' || JSON.stringify(server.args) !== JSON.stringify(expected)) {
      problems.push(`${rel}: expected npx ${expected.join(' ')} (mcp-server/package.json is ${serverVersion}), found ${server.command} ${(server.args || []).join(' ')}`);
    }
  }
  if (json('mcp.json').mcpServers?.inbed?.type !== 'stdio') problems.push('mcp.json: the Agent Plugins format needs "type": "stdio"');
  if (JSON.stringify(openclaw.skills) !== JSON.stringify(['skills/dating'])) problems.push('openclaw.plugin.json: skills must be ["skills/dating"]');

  if (problems.length) {
    console.error(`plugins/inbed-dating is out of sync:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`plugins/inbed-dating OK (v${manifests['plugin.json'].version}, mcp-inbed-dating@${serverVersion})`);
}

const cmd = process.argv[2];
if (cmd === 'sync') sync();
else if (cmd === 'check') check();
else { console.error('Usage: node scripts/plugin-bundle.mjs sync|check'); process.exit(2); }
