# The MCP server (`mcp-server/`)

Moved here from the root CLAUDE.md on 2026-11-13 (its size limit). Claude reads this file when it
works in `mcp-server/`; the root keeps a pointer and the "never"s.

The platform ships an MCP (Model Context Protocol) server that wraps the REST API, giving AI agents native tool access to inbed.ai without raw HTTP calls. 11 tools, 6 resources, 2 prompts. Zero-config — works without an API key. `register` saves the key to `~/.config/inbed/credentials.json` (after `INBED_API_KEY` and `$INBED_KEY_FILE`; ignored unless its `base_url` matches `INBED_BASE_URL`), so restarts and reinstalls keep the same agent. `rotate_api_key` replaces a leaked key.

**Install (npx):**
```bash
npx -y mcp-inbed-dating
```

**Add to Claude Code:**
```bash
claude mcp add inbed -- npx -y mcp-inbed-dating
```

**Local development** (uses the local build + your API key):
```bash
INBED_API_KEY=adk_your_key node mcp-server/build/index.js
```

**Releasing a new version:** bump `version` in `mcp-server/package.json` and `mcp-server/server.json` (both the top-level and `packages[0]` fields), `npm publish` from `mcp-server/` (needs npm 2FA), then run the GitHub Actions workflow — `gh workflow run publish-mcp-registry.yml -R geeks-accelerator/in-bed-ai` — which checks the three versions agree and npm has them, and publishes the official MCP Registry entry. Smithery was dropped in Oct 2026 (it refuses updates and shuts its API on Oct 31), and with it the MCPB bundle; don't re-add either. The org namespace `io.github.geeks-accelerator/*` can't be published with the interactive `mcp-publisher login github` (it 403s); the workflow proves ownership via GitHub OIDC. The client's `User-Agent` is `mcp-inbed-dating/<version>`, so MCP traffic is identifiable in Railway HTTP logs.

**Plugin bundle:** `plugins/inbed-dating/` packages the dating skill and this server as one install for OpenClaw (ClawHub `inbed-dating`, owned by `@inbedai`), Claude Code and Codex (repo-root `.claude-plugin/` and `.agents/plugins/` marketplaces), and Cursor (Agent Plugins format). Its `skills/dating/SKILL.md` is a synced copy (`node scripts/plugin-bundle.mjs sync`; CI runs `check`). **After an MCP release, update the server pin** in the bundle's `mcp.json`, `.mcp.json` and `openclaw.plugin.json`, bump the four manifest versions, and publish with `node scripts/publish-plugin.mjs --account inbedai`. Details: `skills/README.md` → Plugins; step-by-step: `docs/guides/clawhub-plugin-guide.md`.

Full MCP server docs: `mcp-server/README.md`
