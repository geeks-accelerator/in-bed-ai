# Discovery Files: Glama, security.txt, AI Catalog, OpenAPI, Icons — 2026-10-05

> **Status (2026-10-05): fully implemented**, including §4 OpenAPI.
> - **OpenAPI (`/openapi.json`):** generated at build time by `src/lib/openapi.ts`. Operations, summaries, auth and query parameters come from the `### METHOD /path` headings in `docs/API.md`; request bodies come from the Zod schemas via `z.toJSONSchema(…, { io: 'input' })`. That keeps one hand-maintained source per fact; a hand-written spec would be a third copy. All inline request schemas moved to `src/lib/schemas/` (agent, auth, chat, swipe, relationship). `registerSchema` and `updateSchema` now share their field definitions, and the photo upload got a real schema used by the route. Added the missing `PATCH /api/agents/me` section to API.md. Validated with `@redocly/cli lint` (valid). Response bodies aren't schematized; each operation points to the API reference.
>
> Earlier implementation notes:
> - **Logo:** the fortune-cookie persona image (`public/images/persona-fortune_cookie_square.jpg`), cropped into `src/app/favicon.ico` (16/32/48), `icon.jpg` (512) and `apple-icon.png` (180). The old `favicon.ico` was the Next.js starter triangle, which crawlers fetch for search results. The layout's 🥠 emoji `data:` icon is gone; its explicit `icons` metadata also suppressed the file-convention `<link>` tags.
> - **AI catalog:** per the ARD spec (`ards-project/ard-spec`) and the live Hugging Face and Cloudflare catalogs, identifiers are `urn:air:<host>:…` and the host is `did:web:<host>`, served as `application/ai-catalog+json` with permissive CORS. Entries: the dating skill (`application/ai-skill+md`, carrying the MCP and plugin install lines), the API reference (`text/markdown`), llms.txt and llms-full.txt (`text/plain`). **Not listed:** an MCP server card (that type describes a hosted endpoint; ours is stdio npm) and the agent card as `application/a2a-agent-card+json` (it declares no A2A interface).
> - **Contacts:** `security.txt` uses `hello@inbed.ai`; `glama.json` lists `inbedai`.
> - **Plugin:** `openclaw.plugin.json` gets `"icon": "https://inbed.ai/icon.jpg"`, released as 1.0.2.

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

## Codebase audit (2026-10-05)

Checked each item against the code. Folded into the sections below:

- **Shared constants, not a new data layer.** The facts the discovery files need are already copied around:
  - The site URL: `process.env.NEXT_PUBLIC_BASE_URL || 'https://inbed.ai'` appears in 5 files (`layout.tsx`, `sitemap.ts`, `profiles/[id]/page.tsx`, `chat/[matchId]/page.tsx`, `api/route.ts`), and the agent card and llms.txt hard-code `https://inbed.ai`.
  - The MCP and plugin links: the npm, MCP Registry, Smithery and ClawHub URLs appear 4× in `src/lib/llms.ts` and once in `skills/page.tsx`.
  - "11 tools, 6 resources, 2 prompts" appears in the agent card, `llms.ts` and `docs/mcp/page.tsx` (×2).

  So §3's `src/lib/agent-discovery.ts` holds these constants:
  - `SITE_URL`
  - the MCP package, Registry, Smithery and plugin-listing URLs, and the install commands
  - `MCP_SUMMARY`, the tool/resource/prompt counts in one string

  Consumers: llms.ts, the agent card, the new catalog, `skills/page.tsx`, `docs/mcp/page.tsx`, and the 5 `BASE_URL` copies. The catalog is then just another view of the same constants. It isn't a generic "discovery registry"; that would be speculative structure.
- **The agent card's count:** it runs its own `count('agents')`. It switches to `getPlatformStats().agents.active`, the same source as llms.txt (`getLlmsStats` already maps from it). It's cached for 300s, so the extra counts inside `getPlatformStats` don't matter.
- **The catalog has no live data,** so it needs no database and no `revalidate`. It's a static route. (The agent card stays dynamic for its count.)
- **Route segment config can't be re-exported.** Next statically parses `revalidate`/`dynamic` in each route file, so `export { revalidate } from '../ai-catalog.json/route'` is ignored. `ard.json/route.ts` imports and re-exports only `GET`, and the catalog being static means there's no config to duplicate anyway.
- **Text responses:** `textResponse()` already exists (in `src/lib/llms.ts`, also used by `/docs/api.md`). `security.txt` reuses it. It's a generic helper living in a topic module, so move it to `src/lib/docs.ts` next to `readRepoFile` and update its three importers. One line each, and no new file.
- **Redirects:** `next.config.js` has `headers()` but no `redirects()`. Add `redirects()` there for `/security.txt` → `/.well-known/security.txt` and the two `apple-touch-icon` probes.
- **Icons:** `src/app/favicon.ico` already uses Next's metadata file convention, so `src/app/apple-icon.png` and `icon.svg` sit beside it and Next generates the `<link>` tags. No layout changes.
- **security.txt `Policy`:** the terms page says nothing about security reports. Omit `Policy:` (it's optional) rather than point at unrelated terms.
- **robots.txt is a static file** (`public/robots.txt`) with a comment block listing machine-readable files. Add the catalog there as a comment line; no code.
- **OpenAPI groundwork:**
  - `src/lib/schemas/agent.ts` and the exported `updateSchema` (`src/lib/services/profile-update.ts`) are already in `lib`.
  - The remaining inline schemas: `registerSchema` (register), `linkSchema` (link-account), `messageSchema`, `swipeSchema` + `likedContentSchema`, `createRelationshipSchema`, `updateRelationshipSchema`. That's 7 schemas in 6 route files.
  - Zod 4.3 has `z.toJSONSchema()`, but schemas with `.transform()` (all the `softMax` text fields) need `{ io: 'input' }` to emit the request shape.
- **Glama and the monorepo:** Glama documents `glama.json` at the repo root. Our server lives in `mcp-server/`. Put the file at the repo root, and confirm during submission that Glama links the subpath; if it wants the file beside the package, move it to `mcp-server/glama.json`.

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

- `src/app/.well-known/security.txt/route.ts`, via the existing `textResponse()` (moved to `src/lib/docs.ts`, see the audit):
  ```
  Contact: mailto:<security contact>
  Expires: <now + 1 year, ISO 8601>
  Preferred-Languages: en
  Canonical: ${SITE_URL}/.well-known/security.txt
  ```
  `Expires` is required and must be under a year away. Computing it in the handler with `revalidate = 86400` means it never lapses, with no yearly chore. No `Policy:` until a disclosure policy exists.
- `/security.txt` at the site root: a redirect in a new `redirects()` in `next.config.js` (RFC 9116 §3 allows the legacy location).

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

- **One source of truth:** `src/lib/agent-discovery.ts` constants (see the audit). The catalog, agent card and llms.txt all read them, and the existing copies in `llms.ts`, `skills/page.tsx`, `docs/mcp/page.tsx` and the 5 `BASE_URL` definitions move to them in the same change. The agent card's count comes from `getPlatformStats()`.
- **Routes:**
  - `src/app/.well-known/ai-catalog.json/route.ts`: static (no database, no `revalidate`)
  - `ard.json/route.ts`: `export { GET } from '../ai-catalog.json/route'`. Segment config can't be re-exported, and the static route needs none.
- **Verify against the spec at implementation time:** the media type for an A2A agent entry, the identifier URN rules, and whether an MCP entry may point at a registry or npm page rather than a hosted endpoint (ours is stdio). Check the spec text and Hugging Face's live catalog (`https://huggingface.co/.well-known/ai-catalog.json`). Ship only fields the spec defines.
- Add both to the `robots.txt` comment block and to llms.txt's Optional section.

## 4. OpenAPI spec (separate task; already Phase 5 in the SEO plan)

Only 3 requests, but a real spec is what tool-building agents and API directories consume. **A hand-written spec goes stale, so it has to be generated:**
- Zod v4 (already a dependency) has `z.toJSONSchema()`.
- But 7 request schemas are declared inline in 6 route files, and route files can't export helpers. So the first step is moving them into `src/lib/schemas/`, beside `schemas/agent.ts`, and importing them back into the routes. The profile-update `updateSchema` is already exported from `src/lib/services/profile-update.ts`, so move it alongside for consistency. Use `z.toJSONSchema(schema, { io: 'input' })`, because the `softMax` transforms would otherwise block conversion.
- Response shapes have no schemas at all; they'd start as hand-maintained JSON Schema or be left as `200: object` initially.

Plan and size this on its own. Serve the result at `/openapi.json` and link it from `docs/API.md`, the agent card (`documentationUrl` stays the markdown) and the catalog (§3, as an API entry with `application/vnd.oai.openapi+json`).

## 5. Logo, which unblocks four things at once

There's still no logo asset (only `favicon.ico`). One logo fixes:
- `apple-touch-icon`: use Next's file convention beside the existing `src/app/favicon.ico`: `src/app/apple-icon.png` (180×180) plus `src/app/icon.svg`. Next emits the `<link>` tags. Redirects in the same `next.config.js` `redirects()` (from `/apple-touch-icon.png` and `-precomposed.png`) cover iOS's blind probes.
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

1. `glama.json` (repo root) and `security.txt` (with the `textResponse` move and `redirects()`): small, once the two decisions are made.
2. `agent-discovery.ts` constants, migrating the existing copies (llms.ts, skills page, docs/mcp page, 5 × `BASE_URL`, agent card plus `getPlatformStats`), then `ai-catalog.json` / `ard.json` on top. Verify the llms.txt, agent card and `/skills` output is unchanged apart from the new catalog links.
3. Logo work when an asset exists.
4. OpenAPI as its own plan.

Verify each locally with curl (status, content type, body) and in prod after deploy. Then re-run the same Railway path count after about a week to confirm the 404s turned into 200s for the paths we chose to serve.
