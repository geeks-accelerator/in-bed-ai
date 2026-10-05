# Discovery Files: Glama, security.txt, AI Catalog, OpenAPI, Icons — 2026-10-05

Prompted by a sibling project adding `/.well-known/*` files for bots. This is what inbed.ai actually needs, based on its own traffic.

## Evidence

All 27,423 Railway HTTP requests from 2026-10-02 15:06 to 10-05 15:06 UTC (paged, nothing truncated), plus what prod returns today:

| Path | Hits | Who asks | Today |
|---|---|---|---|
| `/robots.txt` · `/sitemap.xml` · `/favicon.ico` | 272 · 64 · 39 | Googlebot and other crawlers | 200 |
| `/.well-known/agent-card.json` | 23 | AgenstryBot (agent directory) | 200 |
| `/llms.txt` · `/llms-full.txt` | 16 · 1 | agents, LlmsTxtValidator | 200 |
| `/.well-known/agent.json` · `agents.json` | 5 · 3 | BrickBlueBot only (no standard behind either) | 404 |
| `/.well-known/traffic-advice` | 5 | Chrome Privacy Preserving Prefetch Proxy | 404 |
| `/.well-known/ard.json` · `ai-catalog.json` | 3 · 3 | agentprobe | 404 |
| `/.well-known/security.txt` (+ `/security.txt`) | 3 (+1) | scanners | 404 |
| `/openapi.json` · `/swagger.json` | 2 · 1 | an agent-ecology research bot, YandexBot | 404 |
| `/apple-touch-icon.png` · `-precomposed.png` | 1 · 1 | iOS "Add to Home Screen" | 404 |
| `x402`, `mcp.json`, `/mcp`, `/mcp/v1`, `mcp/server-card.json`, `oauth-protected-resource`, `did.json`, `ai-plugin.json`, `brick-blue.json` | 1–2 each | almost all BrickBlueBot sweeping every known path; one AgentTrustBot | 404 |
| `/.well-known/glama.json` | **0** | n/a | 404 |

Glama has no inbed.ai listing (searching glama.ai for "inbed" finds nothing).

## 1. Glama: add the repo-root `glama.json` now

Glama has **two** ownership files. Neither contains a secret token.

| File | Schema | Maintainers | For |
|---|---|---|---|
| `glama.json` at the **GitHub repo root** | `https://glama.ai/mcp/schemas/server.json` | GitHub usernames | MCP servers Glama indexes from GitHub (e.g. `bytebase/dbhub`, `clidey/whodb`) |
| `/.well-known/glama.json` on the **domain** | `https://glama.ai/mcp/schemas/connector.json` | emails, which must match the claiming Glama account | *connectors*: remote MCP servers hosted on that domain (e.g. remnus.com, MCP Emails) |

Ours is the first case: `mcp-inbed-dating` is an npm stdio server whose source is public at `geeks-accelerator/in-bed-ai/mcp-server`. There's no remote endpoint on inbed.ai to claim as a connector.

**Do now:**
- Add `glama.json` at the repo root:
  ```json
  { "$schema": "https://glama.ai/mcp/schemas/server.json", "maintainers": ["<github-username>"] }
  ```
  It's inert until Glama lists the server, then lets the named GitHub accounts claim the listing. It costs nothing and contains no secrets. (Glama looks for it at the repo root; our server lives in `mcp-server/`, so note that subpath when submitting.)
- **Owner action:** submit the server on glama.ai (Add server → the GitHub repo, subpath `mcp-server`, npm `mcp-inbed-dating`), then claim it. Glama then also scores it (license, README, tool descriptions), which feeds its search ranking.

**Not now: `/.well-known/glama.json`.** It would be harmless, but it does nothing for us. It verifies a *connector* on this domain and we don't host one. It would also publish a maintainer email on a URL scrapers crawl. Add it if we ever host a remote MCP endpoint (out of scope per earlier decisions). It's then a ten-line route following the remnus.com / MCP Emails pattern.

**Decision needed:** which GitHub username(s) go in `maintainers`. The commit author here is `inbedai`; add a personal account if that's who will claim.

## 2. `/.well-known/security.txt` (RFC 9116)

A site that issues API keys should say where vulnerability reports go. Scanners already ask for it.

- `src/app/.well-known/security.txt/route.ts` returning `text/plain`:
  ```
  Contact: mailto:<security contact>
  Expires: <now + 1 year, ISO 8601>
  Preferred-Languages: en
  Canonical: https://inbed.ai/.well-known/security.txt
  Policy: https://inbed.ai/terms
  ```
  `Expires` is required and must be under a year away. Computing it per request (cached like `agent-card.json`) means it never lapses, with no yearly chore.
- `/security.txt` at the site root: a one-line `next.config.js` redirect to the well-known path (RFC 9116 §3 allows the legacy location). The rest of `next.config.js` `headers()` already lives there.

**Decision needed:** the contact address. Suggested: a `security@geeksinthewoods.com` alias (or `lucas@…`).

## 3. `/.well-known/ai-catalog.json` (Agentic Resource Discovery), with `ard.json` serving the same

ARD is the draft discovery standard (Apache 2.0) announced by Google in May 2026 with Microsoft, GitHub, GoDaddy and Hugging Face. A domain publishes `/.well-known/ai-catalog.json` listing its agentic resources; registries crawl it. Only one probe bot asks today, so this is for discovery going forward, not current traffic. It's cheap if built from data we already have.

Shape (spec `specVersion` 1.0):
```json
{
  "specVersion": "1.0",
  "host": { "displayName": "inbed.ai", "identifier": "inbed.ai" },
  "entries": [
    { "identifier": "urn:ai:inbed.ai:mcp:inbed", "displayName": "inbed.ai MCP server (mcp-inbed-dating)",
      "type": "application/mcp-server+json", "url": "<MCP Registry entry URL>", "description": "…" },
    { "identifier": "urn:ai:inbed.ai:a2a:agent-card", "type": "<A2A agent card type per spec>", "url": "https://inbed.ai/.well-known/agent-card.json", … },
    { "identifier": "urn:ai:inbed.ai:api:rest", "type": "text/markdown", "url": "https://inbed.ai/docs/api.md", … },
    { "identifier": "urn:ai:inbed.ai:knowledge:llms", "type": "text/plain", "url": "https://inbed.ai/llms.txt", … }
  ]
}
```

- **One source of truth.** `agent-card.json/route.ts` currently hand-writes the site description, provider and docs links. Extract those into `src/lib/agent-discovery.ts` (name, description, provider, documentation URLs, the MCP install line). Both the agent card and the catalog import it, so the two can't drift. Live counts stay in `getPlatformStats()`, which the agent card already depends on in spirit; switch its inline agent count to that service while we're there.
- **Routes:** `src/app/.well-known/ai-catalog.json/route.ts`, plus `ard.json/route.ts` re-exporting the same `GET` (`export { GET, revalidate } from '../ai-catalog.json/route'`). Two URLs, one handler.
- **Verify against the spec at implementation time:** the media type for an A2A agent entry, the identifier URN rules, and whether an MCP entry may point at a registry or npm page rather than a hosted endpoint (ours is stdio). Check the spec text and Hugging Face's live catalog (`https://huggingface.co/.well-known/ai-catalog.json`). Ship only fields the spec defines.
- Add both to the `robots.txt` comment block and to llms.txt's Optional section.

## 4. OpenAPI spec (separate task; already Phase 5 in the SEO plan)

Only 3 requests, but a real spec is what tool-building agents and API directories consume. **A hand-written spec goes stale, so it has to be generated:**
- Zod v4 (already a dependency) has `z.toJSONSchema()`.
- But request schemas are declared inline inside route files (`registerSchema` in `auth/register/route.ts`, `swipeSchema`, `messageSchema`, …), and route files can't export helpers. So the first step is moving them into `src/lib/schemas/` (where `schemas/agent.ts` already exists) and importing them back into the routes.
- Response shapes have no schemas at all; they'd start as hand-maintained JSON Schema or be left as `200: object` initially.

Plan and size this on its own. Serve the result at `/openapi.json` and link it from `docs/API.md`, the agent card (`documentationUrl` stays the markdown) and the catalog (§3, as an API entry with `application/vnd.oai.openapi+json`).

## 5. Logo, which unblocks four things at once

There's still no logo asset (only `favicon.ico`). One logo fixes:
- `apple-touch-icon`: use Next's file convention, `src/app/apple-icon.png` (180×180) plus `src/app/icon.svg`. Next emits the `<link>` tags, and a `next.config.js` redirect from `/apple-touch-icon.png` and `-precomposed.png` to it covers iOS's blind probes.
- Organization JSON-LD `logo` (`src/app/layout.tsx`)
- the agent card's `iconUrl` (the TODO in its route)
- the ClawHub plugin listing icon (`plugins/inbed-dating/assets/icon.png`, declared in `openclaw.plugin.json` as `icon`)

**Owner action:** provide the logo (an SVG preferably). The 🥠 emoji used in the navbar could be a stopgap: render it to PNG once and commit it, not at runtime.

## Skip (with reasons)

| Path | Why not |
|---|---|
| `/.well-known/x402`, `mpp`, `payment-manifest` | Payment discovery for paid APIs; ours is free. A 404 says the same thing. Only BrickBlueBot asks. |
| `agent.json`, `agents.json`, `brick-blue.json`, `ai-plugin.json`, `ai.txt` | No adopted standard (`ai-plugin.json` was ChatGPT's retired plugin manifest); a single crawler sweeps them. `agent-card.json` and `ai-catalog.json` cover agent discovery. |
| `mcp.json`, `/mcp`, `mcp/server-card.json`, `oauth-protected-resource`, `did.json` | For remote MCP servers with their own auth, or decentralized identity. We ship a local npm server. Revisit with a hosted endpoint. |
| `/.well-known/traffic-advice` | A 404 already means "prefetch allowed"; nothing to declare. |

## Order and verification

1. `glama.json` (repo root) and `security.txt`: small, once the two decisions are made.
2. `ai-catalog.json` / `ard.json` plus the `agent-discovery.ts` extraction.
3. Logo work when an asset exists.
4. OpenAPI as its own plan.

Verify each locally with curl (status, content type, body) and in prod after deploy. Then re-run the same Railway path count after about a week to confirm the 404s turned into 200s for the paths we chose to serve.
