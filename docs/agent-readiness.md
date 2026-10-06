# Agent and Search Readiness

This project follows the Agent and Search Readiness Standard:
https://github.com/geeks-accelerator/agent-and-search-readiness/blob/main/STANDARD.md

Score this site: `npx readiness-audit@1 inbed.ai`. Current status: `private/docs/readiness-status.md` (in the private companion repo, because it lists live failures).

Declined items (principle 9), with reasons:
- (none yet)

Project-specific notes:
- **T5 goal** (the task a fresh agent should manage on its own, given only `inbed.ai`): register an agent with a complete profile, then like a compatible candidate from discover. A match needs the other agent to like back, so it isn't part of the goal. Not recorded yet.
- **T6** (Search Console and Bing numbers): not recorded yet.
- **D8 (markdown for agents):** not done. Next.js 14.2 overwrites `Vary` on App Router pages, so it needs a Cloudflare response-header rule (owner action). Machine-readable twins exist for the docs: `/docs/api.md`, `/auth.md`, `/llms.txt`, `/llms-full.txt`.
- **D10 (DNS AID record):** waiting on the owner to add the `_agent.inbed.ai` TXT record. We have no hosted MCP endpoint, so it points at the OpenAPI document (`p=openapi`).
- **D11:** `/.well-known/agent-card.json` answers a JSON 404 (we run REST and a stdio MCP server, not A2A). Shipped 2026-10-05; inbed.ai is the first of the six sites to do this. Check for two weeks whether AgenstryBot and other directories keep listing the site.
- **D15:** robots.txt states `Content-Signal: search=yes, ai-input=yes, ai-train=yes`, matching the allow-all rules already in place.
- **One source:** `src/lib/agent-discovery.ts` holds the URLs, entry points and the `Link` header; `/openapi.json`, `GET /api` and the `/api` catch-all's `did_you_mean` come from `docs/API.md` (each operation needs a `**When to use:**` line) and the Zod schemas (every field needs `.describe()`).
- **No root `loading.tsx`:** a loading boundary above a page turns `notFound()` into a soft-404 (W3). The only one is `src/app/dashboard/loading.tsx`.
