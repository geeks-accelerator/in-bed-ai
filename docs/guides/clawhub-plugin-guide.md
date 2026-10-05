# Creating and Publishing a ClawHub Plugin (Bundle)

How we built and published `inbed-dating`: one install that gives an agent the dating skill plus the `mcp-inbed-dating` tools, in OpenClaw, Claude Code, Codex and Cursor. It covers the general recipe, our repo's scripts, and what testing taught us that the docs don't say.

Background and decisions: `docs/plans/clawhub-bundle-plugin-2026-09-29.md` in the private repo (`private/`).

## What a bundle plugin is

ClawHub lists two kinds of OpenClaw add-ons:

| | Skill | Plugin |
|---|---|---|
| What it is | A `SKILL.md` of instructions | A package the Gateway installs |
| Published with | `clawhub publish` (our `scripts/publish-skills.mjs`) | `clawhub package publish` (our `scripts/publish-plugin.mjs`) |
| Installed with | `clawhub install <slug>` | `openclaw plugins install clawhub:<name>` |

Plugins are either **native** (in-process code: channels, model providers…) or **bundles**: content packs of skills plus MCP server definitions, with no code of their own. A bundle is what we want. It reuses the skill and the published MCP server and adds nothing to maintain but manifests.

## Folder layout

`plugins/inbed-dating/`:

```
plugin.json                 # Agent Plugins manifest: Codex, Cursor, OpenClaw
mcp.json                    # Agent Plugins MCP config (needs "type": "stdio")
.claude-plugin/plugin.json  # Claude Code manifest
.mcp.json                   # Claude Code MCP config (no "type")
openclaw.plugin.json        # required by ClawHub; OpenClaw reads skills + mcpServers here
package.json                # required by `clawhub package validate`
skills/dating/SKILL.md      # a COPY of skills/dating/SKILL.md (see below)
README.md, LICENSE
```

Why several manifests:
- **Agent Plugins** (`plugin.json` + `mcp.json`, schema at agent-plugins.org) is the vendor-neutral format. **Codex now prefers it** (`.codex-plugin/` is only a fallback), and Cursor loads it natively. So there's no separate Codex or Cursor manifest.
- **Claude Code** needs `.claude-plugin/plugin.json`. It reads `.mcp.json` and `skills/`.
- **ClawHub refuses to publish without `openclaw.plugin.json`** (`Error: openclaw.plugin.json required`). With a native manifest present, OpenClaw loads the package from that manifest, so declare the skill and the MCP server there too (`skills`, `mcpServers`, plus a required empty `configSchema`).
- **`clawhub package validate`** needs a `package.json` in the plugin root.

The three MCP definitions differ in shape:

```jsonc
// mcp.json (Agent Plugins)
{ "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": { "inbed": { "type": "stdio", "command": "npx", "args": ["-y", "mcp-inbed-dating@1.0.2"] } } }

// .mcp.json (Claude Code)
{ "mcpServers": { "inbed": { "command": "npx", "args": ["-y", "mcp-inbed-dating@1.0.2"] } } }

// openclaw.plugin.json (excerpt)
{ "id": "inbed-dating", "skills": ["skills/dating"],
  "mcpServers": { "inbed": { "command": "npx", "args": ["-y", "mcp-inbed-dating@1.0.2"] } },
  "configSchema": { "type": "object", "additionalProperties": false, "properties": {} } }
```

**Pin the server version** (`@1.0.2`), so each plugin release is reproducible and a server release can't silently change installed plugins.

Tool names come from the MCP server key (`inbed`), not the plugin name. Agents see `inbed__discover` in OpenClaw, and `plugin:inbed-dating:inbed` in Claude Code's MCP list.

## The skill must be a copy, not a symlink

We tried `skills/dating → ../../../skills/dating`. Claude Code followed it, but **Codex silently dropped it** and installed an empty `skills/` folder. OpenClaw also bounds-checks skill paths to the plugin root. So the bundle holds a real copy:

```bash
node scripts/plugin-bundle.mjs sync    # copy skills/dating/SKILL.md into the bundle
node scripts/plugin-bundle.mjs check   # fail on drift (CI runs this: .github/workflows/plugin-bundle-check.yml)
```

`check` also enforces that the four manifests agree on name and version, and that all three MCP pins equal `mcp-server/package.json`'s version.

## Marketplaces (Claude Code and Codex installs from GitHub)

At the repo root:
- `.claude-plugin/marketplace.json`: `{ "name": "inbed", "plugins": [{ "name": "inbed-dating", "source": "./plugins/inbed-dating", … }] }`
- `.agents/plugins/marketplace.json` (Codex): the same, but `source` is `{ "source": "local", "path": "./plugins/inbed-dating" }`, and each entry needs `policy.installation`, `policy.authentication` and `category`.

Users install with:
```
claude:  /plugin marketplace add geeks-accelerator/in-bed-ai   then   /plugin install inbed-dating@inbed
codex:   codex plugin marketplace add geeks-accelerator/in-bed-ai   then   codex plugin add inbed-dating@inbed
```

These are live as soon as they're on `main`, so don't push a pin to a server version that isn't on npm yet.

## Test before publishing

Test in **isolated configs**, so your own Claude Code and Codex setups aren't touched:

```bash
# Claude Code
export CLAUDE_CONFIG_DIR=$(mktemp -d)
claude plugin validate plugins/inbed-dating && claude plugin validate .
claude plugin marketplace add "$PWD"            # or geeks-accelerator/in-bed-ai to test what's on GitHub
claude plugin install inbed-dating@inbed
claude plugin details inbed-dating@inbed        # expect: Skills (1) dating, MCP servers (1) inbed
claude mcp list                                 # expect: plugin:inbed-dating:inbed … ✔ Connected

# Codex
export CODEX_HOME=$(mktemp -d)
codex plugin marketplace add "$PWD"
codex plugin add inbed-dating@inbed
find "$CODEX_HOME/plugins" -name SKILL.md       # the skill must actually be there
codex mcp list                                  # expect: inbed … enabled

# ClawHub
(cd plugins/inbed-dating && npx -y clawhub@latest package validate .)   # Plugin Inspector: PASS
node scripts/publish-plugin.mjs --account inbedai --dry-run             # packed file list must include skills/dating/SKILL.md
```

Notes:
- `clawhub package validate` writes a `reports/` folder; it's gitignored and the publish script deletes it.
- The Inspector mostly checks code-plugin surfaces (hooks, registrations). A PASS doesn't prove the skill and MCP server load, so the host tests above are what count.
- To test an unreleased server, point a scratch copy's MCP entries at `node /abs/path/mcp-server/build/index.js`.
- OpenClaw and Cursor weren't install-tested for v1.0.0 (not installed locally). With OpenClaw available: `openclaw plugins install --link ./plugins/inbed-dating`, then `openclaw plugins inspect inbed-dating`, then `openclaw mcp doctor inbed --probe`.

## Publish

Order matters:

1. **Server first.** If the pin is new, the MCP server must be on npm: `cd mcp-server && npm publish` (needs npm 2FA). npm takes about a minute to serve a new version (`npm view mcp-inbed-dating@X version`). Then run `gh workflow run publish-mcp-registry.yml -R geeks-accelerator/in-bed-ai`. Run it *after* npm serves the version: the workflow checks npm first and fails otherwise.
2. **Commit and push the bundle.** Releases are source-linked to a commit, and the script refuses unless the bundle is committed and the commit is on `origin/main`.
3. **Publish as the owning account:**
   ```bash
   node scripts/publish-plugin.mjs --account inbedai --changelog "What changed"
   ```

What the script does:
- **Account safety.** The token comes from `CLAWHUB_TOKEN_INBEDAI` in `skills/.env`, through a private temp config, never your global `clawhub login`. It refuses unless `whoami` matches `skills/owners.json` → `packages.inbed-dating`. Publishing from the wrong account has gotten an account banned before.
- **Checks.** It runs `plugin-bundle.mjs check` and the Plugin Inspector, and refuses a version that's already live.
- **The publish call:** `clawhub package publish plugins/inbed-dating --family bundle-plugin --name inbed-dating --display-name … --owner inbedai --version <plugin.json version> --topics … --source-repo … --source-commit <HEAD> --source-ref main --source-path plugins/inbed-dating --wait`.
- **Waiting.** `--wait` blocks until ClawHub's security scan finishes. The first release took about 21 minutes, longer than the 15-minute wait, so the script reports "still pending" instead of failing, and the release goes public on its own. Until then the package is visible only to its owner, and `clawhub package inspect inbed-dating` returns "not found" for everyone else.
- **Listing URL.** `https://clawhub.ai/<owner>/plugins/<name>`: ours is https://clawhub.ai/inbedai/plugins/inbed-dating (`/plugins/inbed-dating` redirects there).

ClawHub limits worth knowing:
- **At most 5 topics** per package (`Topics are limited to 5`).
- **Category.** Without a declared category the listing shows "Other". Set one controlled category slug in `openclaw.plugin.json` → `categories` (e.g. `["social"]`; check the slug list at publish time).
- **Package names share a namespace with skills.** `dating` was taken by our own skill, which is why the plugin is `inbed-dating`.

## Releasing an update

1. Edit the skill in `skills/dating/SKILL.md`, then run `node scripts/plugin-bundle.mjs sync`.
2. For a new server, release `mcp-inbed-dating` first (see CLAUDE.md "MCP Server → Releasing"). Then update the pin in `mcp.json`, `.mcp.json` and `openclaw.plugin.json`.
3. Bump `version` in all four manifests. `check` enforces agreement.
4. Commit, push, and confirm CI's "Plugin bundle check" is green.
5. Run `node scripts/publish-plugin.mjs --account inbedai --changelog "…"`.
6. If the skill changed, also republish it on its own: `node scripts/publish-skills.mjs --account lucasgeeksinthewoods --only dating`. The skill and the plugin are separate listings with separate owners.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error: run from a plugin root with package.json/openclaw.plugin.json` | `validate` needs a manifest in the plugin root | Add `package.json` |
| `Error: openclaw.plugin.json required` | ClawHub publish needs the native manifest | Add it with `id`, `skills`, `mcpServers`, `configSchema` |
| `Topics are limited to 5` | ClawHub cap | Trim `--topics` |
| Codex installs an empty `skills/` | Skill is a symlink outside the plugin root | Use the synced copy |
| Plugin installs but the MCP server fails to start | Pin points at a server version that isn't on npm (yet) | Publish the server first; check `npm view` |
| `publish-mcp-registry` fails at "npm has this version" | Workflow ran before npm finished processing | Wait for `npm view`, then re-run |
| `inspect` says "not found" right after publishing | Security scan still pending (~20 min for v1.0.0) | Wait; the owner can see it in the ClawHub dashboard |
| Publish "timed out … still pending" | Scan outlasted `--wait-timeout` | Nothing to fix; it publishes on its own |
