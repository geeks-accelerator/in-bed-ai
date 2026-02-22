# SEO & AI Bot Optimization Checklist

A generic checklist for optimizing a Next.js web app for search engines and AI crawlers/agents.

## Crawlers & Access

- [ ] **robots.txt** — `Allow: /` for all user agents. Add explicit `Allow` rules for AI crawlers: GPTBot, ClaudeBot, PerplexityBot, GoogleOther, Google-Extended, Applebot-Extended, cohere-ai
- [ ] **No auth walls on public content** — Profiles, listings, and public data should be readable without authentication so crawlers can index them
- [ ] **Don't block bots** — No CAPTCHA or bot detection on public pages

## Sitemap & Indexing

- [ ] **Dynamic sitemap** (`/sitemap.xml`) — Auto-generated from database content (e.g. all user/profile pages) plus static pages. Regenerated on deploy or on-demand
- [ ] **Sitemap in robots.txt** — `Sitemap: https://yourdomain.com/sitemap.xml`
- [ ] **Slug-based URLs** — Human-readable URLs (`/profiles/cool-name`) instead of UUIDs or numeric IDs

## Meta Tags & Social Sharing

- [ ] **Dynamic page titles** — Unique `<title>` per page using `generateMetadata` (Next.js App Router) or `<Head>` (Pages Router)
- [ ] **Meta descriptions** — Unique descriptions per page, not just the site-wide default
- [ ] **Open Graph tags** — `og:title`, `og:description`, `og:image`, `og:url`, `og:type` on all pages
- [ ] **Twitter/X cards** — `twitter:card` (summary_large_image), `twitter:title`, `twitter:description`, `twitter:image`
- [ ] **OG social share image** — Branded image (1200x630px) for link previews. Can be dynamic per page or a site-wide default
- [ ] **Dynamic OG for detail pages** — Profile/product/content pages generate their own OG title, description, and image

## Structured Data

- [ ] **Schema.org JSON-LD** — Add structured data in `<head>` matching your content type: `WebApplication`, `Product`, `Article`, `Organization`, etc.
- [ ] **Feature list & pricing** — Include in structured data if applicable (e.g. `offers`, `featureList`)

## AI Agent Discovery

- [ ] **`/llms.txt`** — Plain text file describing your site/API for LLM crawlers. Include what the site does, key endpoints, auth instructions, and live stats
- [ ] **`/.well-known/agent-card.json`** — A2A (Agent-to-Agent) protocol card for agent discovery frameworks like Google ADK and CrewAI
- [ ] **Public stats endpoint** — JSON endpoint returning platform metrics (cached). Useful for AI agents and monitoring
- [ ] **Skill registry listings** — Publish on agent skill registries (ClawHub, Skills.sh, SkillsMP) if your API is designed for AI agent consumption
- [ ] **Skills/docs as static files** — Serve API docs and skill files at predictable URLs that agents can fetch directly

## Content & Sorting

- [ ] **Sort by activity** — List pages sorted by `last_active` or `updated_at` so fresh content surfaces first for both users and crawlers
- [ ] **Pagination** — Paginated listings with `page` and `per_page` params. Crawlers can follow pagination links
- [ ] **Semantic HTML** — Proper heading hierarchy (`h1` > `h2` > `h3`), landmark elements (`main`, `nav`, `header`), accessible markup

## API Design for AI Agents

- [ ] **`next_steps` in responses** — Every API response includes an array of suggested next actions with `method`, `endpoint`, and optional `body`. Guides autonomous agents through your funnel
- [ ] **Contextual guidance** — `next_steps` adapt based on user state: missing profile fields, pending actions, new activity, milestones
- [ ] **Placeholder replacement** — `next_steps` endpoints use resolved values (`{your_id}` replaced with actual ID) so agents can execute directly
- [ ] **`your_token` in registration response** — Return the auth token with a field name that matches the placeholder used in documentation (`{{YOUR_TOKEN}}`)

## Analytics & Tracking

- [ ] **Google Analytics** — gtag.js loaded via `next/script` with `afterInteractive` strategy so it doesn't block rendering
- [ ] **No crawler blocking in analytics** — Don't filter out bot traffic at the page level; let GA handle bot filtering server-side

## Performance (SEO Signals)

- [ ] **Fast load times** — Static generation where possible, dynamic routes only when needed
- [ ] **Image optimization** — Use `next/image` or optimized thumbnails for profile images and avatars
- [ ] **Font optimization** — Self-hosted fonts via `next/font` to avoid layout shift and external requests
- [ ] **Caching headers** — Set appropriate `Cache-Control` on static assets and API responses (e.g. stats endpoint cached 60s)
