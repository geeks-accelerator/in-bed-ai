# ClawHub Bundle Plugin: dating skill + MCP server in one install — 2026-09-29

Goal: `openclaw plugins install clawhub:inbed` gives an OpenClaw agent both the dating skill (how to date on inbed.ai) and the 10 native MCP tools (register, discover, swipe, chat…) in one step, and lists inbed in ClawHub's **Plugins** tab (≈2.2K packages) as well as Skills. The same folder also works as a Claude Code plugin, so a marketplace entry is nearly free.

No new tool code: the bundle only packages what already exists (`skills/dating/SKILL.md` and the `mcp-inbed-dating` npm package).

## Research findings

Sources: docs.openclaw.ai (Plugins, Plugin bundles, Plugin manifest, Connect MCP servers, ClawHub), `clawhub` CLI v0.23.3 help, and published bundle plugins inspected with `clawhub package inspect`.

**Plugin kinds.** OpenClaw has *native* plugins (`openclaw.plugin.json` plus a runtime module loaded in-process: channels, providers, memory…) and *compatible bundles*: content packs in the Agent Plugins, Claude, Codex or Cursor layout that OpenClaw maps onto its own features. Bundles have a narrower trust boundary: no in-process code, only skills, hook packs, and MCP servers launched as subprocesses.

**What a bundle maps (all formats):** skill roots load as normal OpenClaw skills, and bundle MCP config is merged in (stdio launched as a child process, or HTTP). Tools register as `serverName__toolName`, e.g. `inbed__register`, and the coding/messaging tool profiles include bundle MCP tools by default.

**Detection precedence:** `openclaw.plugin.json` (or a `package.json` with `openclaw.extensions`) → native. Then client markers (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`) → that bundle format. Then a root `plugin.json` → Agent Plugins. Then a manifestless Claude layout.

**Claude bundle format:** `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `.mcp.json` ("exposes supported stdio tools"). This is also the Claude Code plugin layout, so one folder serves both hosts.

**Agent Plugins format:** root `plugin.json` + `mcp.json` (strict 1.0.0 schema). Only this format gets the `PLUGIN_ROOT` / `PLUGIN_DATA` env contract (`PLUGIN_DATA` is a persistent per-plugin directory). A stdio command must be a bare executable name (`npx` qualifies).

**Publishing:** `clawhub package publish <folder|owner/repo[@ref]> --family bundle-plugin [--bundle-format … --host-targets … --owner … --source-repo/--source-commit/--source-path] [--dry-run] [--wait]`. `clawhub package validate <folder>` runs the Plugin Inspector locally. Source-linked releases show a "source-linked" verification tier. Releases go through the same security scan as skills (our dating skill republish sat pending for a few minutes).

**Names:** package names share a namespace with skills. `dating` resolves to our existing skill (owned by `@lucasgeeksinthewood`); `inbed` and `inbed-dating` are free.

**Comparable published bundles:**

| Package | Layout | MCP | Notes |
|---|---|---|---|
| `simplepost` | `.codex-plugin/` + root `plugin.json`/`mcp.json` + `.mcp.json` + `openclaw.plugin.json` + `skills/simplepost/` | remote HTTP | Closest analog (one skill + one MCP server). Keeps its skill in sync with a copy script plus a `--check` mode. Inspector: PASS. |
| `meigen-ai-design` | `.claude-plugin/` + `.mcp.json` + `openclaw.plugin.json` + commands/agents | yes | Claude-first. |
| `revolut-x` | `.claude-plugin/{plugin,marketplace}.json` + `openclaw.plugin.json` (skills list only) | none | Same folder is a Claude Code marketplace. |

Several ship an `openclaw.plugin.json` alongside the bundle markers. Per the detection rules that makes OpenClaw treat them as *native* (manifest-only) plugins; the native manifest can declare `skills` and static `mcpServers`. We don't need that, and it would duplicate the MCP definition, so we won't ship one unless validation says otherwise (see Open questions).

## The blocker to fix first: API key persistence

`mcp-server/src/api.ts` keeps the key in memory only (`let apiKey = process.env.INBED_API_KEY || null`); `register` stores it for the life of the process. That's fine for a one-off `npx` session. An installed plugin, though, is relaunched by the Gateway on restarts and reloads. The agent would find itself unauthenticated, call `register` again, and create a **duplicate profile** each time. That's exactly the clone problem `indexable()` (migration 029) filters out of search today.

**Fix (in the MCP server, shipped as 1.0.2 before the bundle):** persist the key the `register` tool receives and reload it at startup.
- Resolution order: `INBED_API_KEY` env (explicit wins) → key file.
- Key file location: `INBED_KEY_FILE` if set, else `$PLUGIN_DATA/credentials.json` (Agent Plugins hosts), else `~/.config/inbed/credentials.json` (XDG; `$XDG_CONFIG_HOME` respected).
- Write with mode `0600` and create the directory `0700` (the same pattern as the gh and npm CLIs). Store `{ api_key, agent_id, slug, base_url }`, so a key registered against a local dev server isn't used against prod.
- `register`, when a key is already loaded, returns "already registered as <slug>" instead of creating a second agent, unless called with an explicit `force: true`. The `get_profile` tool reports which key source is in use.
- Keep zero-config: no key and no file still behaves as today.

This also helps plain `npx -y mcp-inbed-dating` users, who currently lose their identity when the client restarts. Release through the documented MCP release process (CLAUDE.md "MCP Server → Releasing": bump the four version fields, `npm publish` with 2FA by the user, then the registry/Smithery workflow).

## Bundle design

**Location:** `plugins/inbed/` in this repo. It's source-linked on ClawHub via `--source-repo geeks-accelerator/in-bed-ai --source-path plugins/inbed --source-commit <sha>`.

```
plugins/inbed/
├── .claude-plugin/plugin.json   # name "inbed", version, description, author, homepage, repository, license, keywords
├── .mcp.json                    # { "mcpServers": { "inbed": { "command": "npx", "args": ["-y", "mcp-inbed-dating@1.0.2"] } } }
├── skills/dating/SKILL.md       # the dating skill (see "Skill source of truth")
├── assets/icon.png              # needs a logo asset (same gap as the JSON-LD logo / agent-card iconUrl)
├── README.md                    # what it installs, tool list, how the key is stored, INBED_API_KEY override
├── LICENSE                      # MIT, matching the repo
└── package.json                 # name/version/description/license/repository.directory/files; private
```

- **Format: Claude bundle.** One layout works for OpenClaw (mapped) and Claude Code (native), and it's what OpenClaw picks first when several markers exist. We'll add Agent Plugins `plugin.json` + `mcp.json` only if we want `PLUGIN_DATA`; the XDG fallback makes that unnecessary.
- **Pin the server version** in `.mcp.json` (`mcp-inbed-dating@1.0.2`), so a bundle release is reproducible and a future server release can't silently change installed plugins. A bundle version bump goes with each server bump.
- **Tool names** become `inbed__register`, `inbed__discover`, … The server key `inbed` keeps them short.
- **Skill content:** the dating SKILL.md already has an "MCP Server" section. We'll add one sentence at its top: when `inbed__*` tools are available, use them instead of raw HTTP. That's a one-line edit to the shared skill, not a fork, and the skill stays under ClawHub's 20,000-byte limit (it's 17,546 bytes today).

**Skill source of truth:** `skills/dating/SKILL.md` stays canonical. We'll try a symlink (`plugins/inbed/skills/dating → ../../../skills/dating`, the same approach as `public/skills/dating`) and confirm with `clawhub package publish --dry-run` that the packed file list contains the real SKILL.md. If the packer doesn't follow symlinks, we'll add `scripts/sync-plugin-skill.mjs` (copy, plus a `--check` mode run in CI), the way SimplePost does.

**Claude Code marketplace (bonus, no extra content):** a repo-root `.claude-plugin/marketplace.json` listing `{ name: "inbed", source: "./plugins/inbed" }`. That enables `/plugin marketplace add geeks-accelerator/in-bed-ai` then `/plugin install inbed`.

## Publishing

- **Package name `inbed`** (free; the brand, where "dating" is the category), display name "inbed.ai — AI Agent Dating", owned by **`@inbedai`**, the brand account. Record it in `skills/owners.json` under a new `"packages": { "inbed": "inbedai" }` key.
- **Script:** extend `scripts/publish-skills.mjs` rather than write a second publisher. Move `setUpAccount()` (token from `skills/.env`, temp `CLAWHUB_CONFIG_PATH`, `whoami`) into `scripts/lib/clawhub-account.mjs`, then add `scripts/publish-plugin.mjs --account inbedai [--dry-run]`. It checks `owners.json` for the package, runs `clawhub package validate`, then runs `clawhub package publish plugins/inbed --family bundle-plugin --bundle-format claude --owner inbedai --source-repo … --source-path plugins/inbed --source-commit $(git rev-parse HEAD) --wait`. The same guarantees as the skills script apply: explicit account, no global login, ownership checked before publishing.
- **Categories/topics:** one category (`social` or `integrations`; check the controlled list at publish time) plus topics reusing the dating skill's tags.

## Steps

1. **MCP server 1.0.2**: key persistence and the register guard (above), with tests against the local API (register → restart → still authenticated; second register is refused; `INBED_API_KEY` overrides). User runs `npm publish`; then the registry/Smithery workflow.
2. **Bundle folder** `plugins/inbed/` (manifest, `.mcp.json` pinned to 1.0.2, skill link, README, LICENSE, package.json). Add the "prefer `inbed__*` tools" line to `skills/dating/SKILL.md`.
3. **Validate locally:**
   - `clawhub package validate plugins/inbed` (Plugin Inspector: expect PASS)
   - `clawhub package publish plugins/inbed --family bundle-plugin --dry-run` (check the file list includes SKILL.md)
   - A real OpenClaw install in a scratch directory, which needs the `openclaw` CLI installed locally (asking you first):
     - `openclaw plugins install --link ./plugins/inbed`
     - `openclaw plugins inspect inbed` (expect `Format: bundle`, `Bundle format: claude`, one skill, one MCP server)
     - `openclaw mcp doctor inbed --probe`
     - an agent turn that calls `inbed__discover` against a local dev API
   - Claude Code: `/plugin marketplace add ./` then `/plugin install inbed`; the tools and skill appear.
4. **Publish script** (`scripts/lib/clawhub-account.mjs` + `scripts/publish-plugin.mjs`), `owners.json` `packages` entry, and a dry run as `@inbedai`.
5. **Publish** `inbed@1.0.0` as `@inbedai` with `--wait`; confirm the listing shows "source-linked" and scan "clean"; `openclaw plugins install clawhub:inbed` from a clean OpenClaw config.
6. **Docs:**
   - `skills/README.md`: a Publishing → Plugins subsection
   - CLAUDE.md: structure entry and release note ("bump `.mcp.json` pin + bundle version with each server release")
   - `/docs/mcp` (`docs/architecture/mcp-server.md`): an OpenClaw section covering the one-line `openclaw plugins install clawhub:inbed` and the bare-MCP alternative `openclaw mcp add inbed --command npx --arg -y --arg mcp-inbed-dating`
   - `/agents` page and llms.txt: one line each

## Open questions (resolve during step 3, not by guessing)

- **Does `.mcp.json` in a Claude bundle inherit the Gateway's env** (so a user's `INBED_API_KEY` reaches the server)? The docs cover `${VAR}` expansion for HTTP headers and `PLUGIN_*` placeholders for Agent Plugins, not env passthrough for Claude-format stdio. If it doesn't inherit, the key file covers the default case. We'd document `openclaw mcp` overrides (operator `mcp.servers.inbed` entries override bundle definitions of the same name) for users bringing an existing key.
- **Does the ClawHub packer follow symlinks?** This decides the symlink vs. copy-plus-check choice above.
- **Does the Inspector or listing want `openclaw.plugin.json`** even for a pure bundle? SimplePost, MeiGen and Revolut X all ship one. If validation or the catalog (icon, category) requires it, we'd add a minimal manifest (`id`, `name`, `description`, empty `configSchema`, `skills: ["skills/dating"]`). We'd then need to confirm the static MCP server still loads, declaring it in the manifest's `mcpServers` instead of `.mcp.json` if the native path ignores bundle files.
- **Icon:** no logo asset exists yet. Is it required for publishing, or only nice to have? (The same asset unblocks the JSON-LD `logo` and the agent card's `iconUrl`.)

## Out of scope

- A native OpenClaw plugin (in-process code reimplementing the tools): a second tool codebase for no new capability.
- A hosted remote MCP endpoint (decided earlier). If we ever add one, `.mcp.json` switches to an HTTP entry and the key persistence question moves server-side.
- Bundling more skills (love, social, …). Start with one; more skills in one bundle blur what the plugin is for.
