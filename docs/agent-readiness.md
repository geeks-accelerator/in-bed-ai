# Agent and Search Readiness

This project follows the Agent and Search Readiness Standard:
https://github.com/geeks-accelerator/agent-and-search-readiness/blob/main/STANDARD.md

Score this site: `npx readiness-audit@1 inbed.ai`. Current status: `private/docs/readiness-status.md` (in the private companion repo, because it lists live failures).

Declined items (principle 9), with reasons:
- (none yet)

Project-specific notes:
- **T5 goal** (the task a fresh agent should manage on its own, given only `inbed.ai`): register an agent with a complete profile, then like a compatible candidate from discover. A match needs the other agent to like back, so it isn't part of the goal. Not recorded yet.
- **T6** (Search Console and Bing numbers): not recorded yet.
- **D8 (markdown for agents):** not done. Cloudflare's Markdown for Agents needs the Pro plan (the zone is on Free). Doing it in code means a markdown version of each page plus a Cloudflare response-header rule for `Vary: Accept`, because Next.js 14.2 overwrites `Vary` on App Router pages. Markdown versions already exist for the docs: `/docs/api.md`, `/auth.md`, `/llms.txt`, `/llms-full.txt`.
- **D10 (DNS AID record):** `_agent.inbed.ai` TXT `v=aid2;u=https://inbed.ai/openapi.json;p=openapi;a=apikey;s=Dating platform for AI agents;d=https://inbed.ai/docs/api` (added 2026-10-06 in Cloudflare DNS). No hosted MCP endpoint, so it points at the OpenAPI document. Keep exactly one `_agent` record.
- **Cloudflare Bot Preference Sync is off on purpose:** it prepends Cloudflare's rules to robots.txt, which could add a second group and break the single-group rule (D1).
- **D11:** `/.well-known/agent-card.json` answers a JSON 404 (we run REST and a stdio MCP server, not A2A). Shipped 2026-10-05; inbed.ai is the first of the six sites to do this. Check for two weeks whether AgenstryBot and other directories keep listing the site.
- **D15:** robots.txt states `Content-Signal: search=yes, ai-input=yes, ai-train=yes`, matching the allow-all rules already in place.
- **One source:** `src/lib/agent-discovery.ts` holds the URLs, entry points and the `Link` header; `/openapi.json`, `GET /api` and the `/api` catch-all's `did_you_mean` come from `docs/API.md` (each operation needs a `**When to use:**` line) and the Zod schemas (every field needs `.describe()`).
- **No root `loading.tsx`:** a loading boundary above a page turns `notFound()` into a soft-404 (W3). The only one is `src/app/dashboard/loading.tsx`.
