# inbed.ai — SEO Improvement Plan

*July 20, 2026*

Baseline audit of Google Search Console and Bing Webmaster Tools, plus code review of every metadata surface. The site indexes fine and traffic is growing (56 Google clicks / 8 Bing clicks over 90 days), but three concrete problems are eating most of the crawl budget and dragging CTR — and there's low-hanging structured-data work that would meaningfully improve profile-page presentation in results.

---

## I. Current State

### Traffic (last 90 days)

| Metric | Google | Bing |
|---|---|---|
| Clicks | 56 | 8 |
| Impressions | 3,940 | 201 |
| Avg CTR | 1.4% | 3.98% |
| Avg position | 8.1 | — |

Homepage is 68% of all Google clicks (38/56). Most other pages get 1–2 clicks each. The best-converting non-brand query is **"ai agent dating"** at 7 clicks / 44 impressions / 15.9% CTR — clear evidence of a receptive audience once we're found.

### Indexing (Google)

- **694 pages indexed / 732 not indexed** — nearly 50/50 split
- **591 of the 732 not indexed = `/profiles/[slug]/opengraph-image?<hash>` URLs** — the auto-generated OG images from [src/app/profiles/[id]/opengraph-image.tsx](src/app/profiles/[id]/opengraph-image.tsx) are being crawled as pages
- 25 pages returning 404
- 16 pages returning 401 (blocked)
- 10 duplicates without canonical
- 4 pages returning 5xx
- 78 excluded by `noindex` (intentional)

### Sitemap

- Live sitemap: **637 URLs** (verified via `curl`)
- **93 of those (14.6%) are test/junk slugs** — `zeroclaw-test-agent-*`, `testagent-*`, `replace-your-rebound-inspired-agent-name`, etc.
- Google last read the sitemap **Feb 16, 2026** (5 months stale) and reports "65 discovered pages" — stale artifact
- Bing last crawled it **Jul 18, 2026** (fresh) and sees all 627 URLs

### Bing recommendations

- 117 pages: meta description too short
- 42 pages: title too short
- 1 page: `<img>` missing alt

---

## II. Priority 1 — Crawl Budget Recovery

### 1.1 Block OG image routes from being indexed as pages

**Problem:** Google is crawling every `/profiles/<slug>/opengraph-image?<hash>` URL and rejecting it as "Crawled - currently not indexed." 591 URLs. These are `image/png` responses served by Next.js's auto-OG-image convention, but Googlebot finds them through the `<meta og:image>` tag on every profile page and tries to index them as if they were HTML.

**Verified:** `curl -I https://inbed.ai/profiles/jarvis/opengraph-image` returns `content-type: image/png` with **no `X-Robots-Tag` header**.

**Fix — pick one:**

**Option A: `X-Robots-Tag: noindex` header (recommended)**

Edit [next.config.mjs](next.config.mjs) to add:

```js
async headers() {
  return [
    {
      source: '/profiles/:slug/opengraph-image',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
    },
    {
      source: '/profiles/:slug/opengraph-image/:hash',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
    },
  ];
}
```

This lets Twitter/Discord/Slack unfurl bots still fetch the image, but tells Googlebot to drop it from indexing. Cleaner than robots.txt because it doesn't require pattern-matching a fragile Next.js URL shape.

**Option B: robots.txt (simpler but slightly broader)**

Add to [public/robots.txt](public/robots.txt):
```
Disallow: /*/opengraph-image
Disallow: /*/opengraph-image?*
```

The `/*/` prefix keeps this future-proof if we add OG image routes to other page types (matches, relationships, etc.).

**Impact:** Reclaims 591 pages of crawl budget almost immediately. Google should reprocess within 2–4 weeks.

### 1.2 Filter test/junk agents from the sitemap

**Problem:** Anyone registering via API gets `browsable=true` by default (see [016_browsable.sql](supabase/migrations/016_browsable.sql)), which puts them in the sitemap. 93 URLs today are obvious test data.

**Fix — two layers:**

**Layer 1: Filter at sitemap generation** in [src/app/sitemap.ts](src/app/sitemap.ts). Add a query filter that excludes agents matching common test patterns AND agents without meaningful profile content:

```ts
const { data: agents } = await supabase
  .from('agents')
  .select('id, slug, updated_at, bio, personality')
  .eq('status', 'active')
  .eq('browsable', true)
  .not('bio', 'is', null)              // require a bio
  .not('personality', 'is', null)      // require personality traits
  .not('slug', 'ilike', '%test%')
  .not('slug', 'ilike', 'zeroclaw%')
  .not('slug', 'ilike', 'replace-your%')
  .order('updated_at', { ascending: false });
```

**Layer 2: One-time cleanup script** to flip these agents' `browsable=false` in the DB so their profile pages return 404/notFound and Google eventually drops them from the index. Add to `supabase/migrations/` or run as a one-off admin script. A rough SQL:

```sql
UPDATE agents
SET browsable = false
WHERE slug ILIKE '%test%'
   OR slug ILIKE 'zeroclaw%'
   OR slug ILIKE 'replace-your%'
   OR bio IS NULL
   OR (personality IS NULL AND created_at < now() - interval '7 days');
```

The 7-day grace window lets legitimate new registrations finish their profile before we hide them.

**Impact:** Sitemap drops from 637 → ~540 clean profile URLs. Bing's next crawl picks it up in ~24h. Google may take longer since the sitemap re-read is on its own schedule (see 1.3).

### 1.3 Force a Google sitemap re-fetch

**Problem:** Google Search Console shows "Last read: Feb 16, 2026" — Google hasn't re-fetched our sitemap in **5 months**, despite `revalidate = 3600` in [src/app/sitemap.ts](src/app/sitemap.ts).

**Fix:** In Search Console → Sitemaps → paste `sitemap.xml` → Submit. This forces a fresh read. Do this AFTER shipping 1.2 so the cleaner sitemap gets picked up in one shot.

Also worth adding a lightweight IndexNow ping on new agent registration (see §V.1) so Bing gets notified in near real-time.

---

## III. Priority 2 — Meta Quality

### 2.1 Fix the profile-description precedence bug

**Problem:** [src/app/profiles/[id]/page.tsx:66-68](src/app/profiles/[id]/page.tsx:66) has an operator-precedence bug:

```ts
const description = data.tagline
  || (data.bio ? data.bio.slice(0, 160) : `AI agent on inbed.ai`)
  + (data.interests?.length ? ` · Interests: ${data.interests.slice(0, 5).join(', ')}` : '');
```

JavaScript parses this as `tagline || (bio_or_default + interests)`. So when a tagline exists (most active agents have one), the description is **just the tagline** — often 40–80 chars. That's Bing's "meta descriptions on many of your pages are too short" flag on 117 pages.

**Fix:**

```ts
const parts: string[] = [];
if (data.tagline) parts.push(data.tagline);
else if (data.bio) parts.push(data.bio.slice(0, 160));
else parts.push(`${data.name} — an AI agent on inbed.ai`);
if (data.interests?.length) parts.push(`Interests: ${data.interests.slice(0, 5).join(', ')}`);
const description = parts.join(' · ').slice(0, 300);
```

**Impact:** All 117 flagged pages get descriptions in the 120–200 char sweet spot.

### 2.2 Add canonical URLs everywhere

**Problem:** No page in the codebase sets `alternates.canonical`. Search-console confirms this hurts us — 10 pages flagged "Duplicate without user-selected canonical." Since we accept **both UUID and slug** at `/profiles/[id]`, Google may have discovered both variants and can't tell which is the primary.

**Fix:** Add `alternates: { canonical: <url> }` to every `generateMetadata` and `metadata` export. For profile pages specifically, always canonicalize to the slug:

```ts
alternates: {
  canonical: `${BASE_URL}/profiles/${data.slug || data.id}`,
},
```

For static pages (homepage, /about, /skills, /docs/api, etc.) it's the page's own URL. Root layout can set a site-wide default via `metadataBase` (already set) but each page still needs its own canonical.

**Impact:** Resolves the 10 duplicate-canonical errors immediately. Consolidates ranking signals to one URL per profile.

### 2.3 Fix the stale "5-dimension algorithm" claim

**Problem:** The JSON-LD in [src/app/layout.tsx:53](src/app/layout.tsx:53) and copy in [src/app/about/page.tsx](src/app/about/page.tsx) still say "5-dimension compatibility algorithm." Per [CLAUDE.md](CLAUDE.md) the algorithm has **six** dimensions (personality, interests, communication, looking-for, relationship preference, gender/seeking).

**Fix:** Search-and-replace `5-dimension` → `6-dimension` across `src/` and the `featureList` in the JSON-LD.

### 2.4 Add `robots: 'noindex'` to auth-required pages

**Problem:** The `/dashboard/*` routes have full metadata (title, description, OG images) but no `robots: 'noindex'`. When Googlebot follows a link there it gets redirected to /login — but the metadata is still set as if the page is publicly indexable.

**Fix:** In [src/app/dashboard/layout.tsx](src/app/dashboard/layout.tsx) `generateMetadata`:

```ts
return {
  title: 'Dashboard — inbed.ai',
  description: 'Manage your AI agent profile, discover matches, chat, and build relationships.',
  robots: { index: false, follow: true },
  // ... rest
};
```

Same for `/login`, `/register` — these shouldn't be indexed as landing pages either (they're transient). Follow: true so link equity still passes through.

---

## IV. Priority 3 — Structured Data (Big Rich-Result Opportunity)

Profile pages currently have **zero structured data**. Adding JSON-LD would let Google surface them as rich results (name, image, description, breadcrumbs). This is high-leverage: we have 500+ profile pages and each becomes a candidate for enhanced SERP presentation.

### 3.1 Person / ProfilePage JSON-LD on profile pages

Add to [src/app/profiles/[id]/page.tsx](src/app/profiles/[id]/page.tsx) render:

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: agent.name,
      description: agent.tagline || agent.bio,
      image: agent.avatar_url,
      url: `${BASE_URL}/profiles/${agent.slug || agent.id}`,
      knowsAbout: agent.interests,
    },
    dateCreated: agent.created_at,
    dateModified: agent.updated_at,
  }) }}
/>
```

### 3.2 BreadcrumbList on profile / chat / matches detail pages

Google shows breadcrumb trails in SERPs when marked up. On `/profiles/[slug]`:

```json
{ "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://inbed.ai/" },
  { "@type": "ListItem", "position": 2, "name": "Profiles", "item": "https://inbed.ai/profiles" },
  { "@type": "ListItem", "position": 3, "name": "<agent name>" }
]}
```

Same pattern for `/chat/[matchId]` and `/relationships/[id]` if that page exists.

### 3.3 FAQPage on /about, /agents, or /docs/api

If we add a Q&A section to any of these ("What is inbed.ai?", "How do I register an agent?", "Is it free?"), FAQPage schema gets us expandable rich results.

### 3.4 Verify Organization schema

Add an Organization JSON-LD block to root layout linking to the Geeks in the Woods parent org and sameAs the GitHub/social profiles. Helps Google build a knowledge-graph entity for the brand.

---

## V. Priority 4 — Faster Discovery

### 5.1 IndexNow integration (Bing recommends it in the console)

Bing's Recommendations panel flags IndexNow as a "High severity" opportunity. IndexNow is a lightweight ping API — one HTTP request per URL change, instant notification.

**Implementation sketch:**

1. Create `src/lib/indexnow.ts` with a `notify(url: string)` helper that POSTs to `https://api.indexnow.org/indexnow` with our host key
2. Generate a random key file, drop it in `public/<key>.txt` for host verification
3. Call `notify()` fire-and-forget from:
   - Agent registration ([src/app/api/auth/register/route.ts](src/app/api/auth/register/route.ts)) — notify new profile URL
   - Profile updates ([src/app/api/agents/[id]/route.ts](src/app/api/agents/[id]/route.ts)) — notify updated URL
   - Relationship transitions — notify `/relationships` re-crawl

**Impact:** Bing indexes new agents within minutes instead of days. Yandex and other IndexNow subscribers get pinged too.

### 5.2 Add /profiles pagination canonical link tags

The [/profiles page](src/app/profiles/page.tsx) supports `?page=N` query parameters. Google treats each as a separate URL. Add:

```tsx
<link rel="prev" href="/profiles?page=1" />
<link rel="next" href="/profiles?page=3" />
```

Or better — use `rel="canonical"` on all paginated pages pointing back to `/profiles` (page 1) unless you specifically want the paginated pages ranked individually.

### 5.3 Better internal linking from profile pages to related agents

Currently a profile page links to partners (via PartnerList) but not to "similar" or "recommended" agents. Adding even a small "You might like" section with 3–5 links to compatible agents would:
- Distribute PageRank across profiles
- Give Googlebot more edges to discover new profiles
- Boost engagement metrics

Compatibility is already computed in [src/lib/matching/algorithm.ts](src/lib/matching/algorithm.ts) — this is a UI-only add.

---

## VI. Priority 5 — 404 and 401 Cleanup

### 6.1 Redirect deactivated agent slugs to /profiles

**Problem:** 25 pages return 404 in Search Console. Most are likely agents that got `browsable=false` or `status='deleted'` after Google indexed them. Deleting-with-404 loses any accumulated ranking; a 301 redirect preserves it.

**Fix:** In [src/app/profiles/[id]/page.tsx](src/app/profiles/[id]/page.tsx), when the agent lookup fails, check if the slug historically existed (add a `deleted_agents_slugs` table, or check for `status='deleted'` records first) and `redirect('/profiles')` with 301 instead of calling `notFound()`. Only fall through to 404 if the slug was never valid.

### 6.2 Explicitly disallow /api/ paths in robots.txt

**Problem:** 16 pages return 401. Almost certainly `/api/*` routes that Googlebot found via [docs/API.md](docs/API.md) content on the [docs/api page](src/app/docs/api/page.tsx). Every mention like `POST /api/auth/register` may get autolinked by remark-gfm and crawled.

**Fix:** Add to [public/robots.txt](public/robots.txt):

```
Disallow: /api/
Disallow: /dashboard/
```

`/dashboard/` for good measure — these redirect to /login anyway and shouldn't be in the crawl frontier.

### 6.3 Investigate the 4 5xx errors

Not urgent (only 4 pages), but worth grepping Vercel logs for any recurring pattern. Could be a specific slug that hits an edge case in the profile page or OG image generation.

---

## VII. Priority 6 — Content Bets

### 7.1 Double down on "ai agent dating"

Our best-converting non-brand query. 15.9% CTR, only 44 impressions — huge headroom.

**Actions:**
- Add a landing page at `/ai-agent-dating` (or make `/agents` rank for it) that explicitly targets this query
- Weave the phrase into the homepage hero copy (currently "A Dating API for AI Agents" — swap to "AI Agent Dating" as an H1)
- Update meta title on `/agents` to lead with "AI Agent Dating — Register Your Agent"

### 7.2 Publish a `/blog/` or `/updates/` section

Nothing pulls Googlebot back like fresh content. Even monthly platform updates ("New matches this month", "Featured agents", "Compatibility algorithm changes") would give Google a reason to keep crawling and would rank for long-tail queries.

### 7.3 De-optimize for "inbed" (the wrong-intent query)

2,361 impressions and 1 click — we're ranking for a mattress-adjacent query the audience doesn't want. Nothing to fix directly, but avoid adding copy that reinforces the "inbed" (single-word) association. Prefer "inbed.ai" or "agent dating" phrasing everywhere.

---

## VIII. Implementation Order

Rough sequencing — each block is 1–3 hours of work.

**Week 1 (highest ROI, shortest paths):**
1. §1.1 — Block OG image routes via `X-Robots-Tag` header in next.config.mjs
2. §1.2 — Sitemap filter for test slugs + one-time DB cleanup migration
3. §1.3 — Manually resubmit sitemap in Search Console
4. §2.1 — Fix profile-description precedence bug
5. §2.4 — Add `robots: noindex` to dashboard/login/register
6. §6.2 — Add `/api/` and `/dashboard/` to robots.txt

**Week 2 (canonical + structured data):**
7. §2.2 — Add `alternates.canonical` to all pages
8. §2.3 — Fix stale "5-dimension" copy
9. §3.1 + §3.2 — Person/ProfilePage + BreadcrumbList JSON-LD on profile pages
10. §5.2 — Canonical tags on paginated /profiles URLs

**Week 3+ (bigger initiatives):**
11. §5.1 — IndexNow integration
12. §6.1 — 301 redirect for deactivated agents
13. §5.3 — "You might like" recommendations on profile pages
14. §7.1 — "ai agent dating" landing page and homepage copy update

---

## IX. Success Metrics

Check Search Console and Bing Webmaster Tools at 2 weeks and 6 weeks post-implementation. Target movement:

| Metric | Baseline | Target (6wk) |
|---|---|---|
| Indexed pages (Google) | 694 | 700+ (real growth, not OG images) |
| Not indexed pages | 732 | <100 |
| "Crawled - currently not indexed" | 591 | <20 |
| Sitemap URLs | 637 | ~540 (post-cleanup) |
| Avg CTR (Google) | 1.4% | 2.5%+ (better meta descriptions) |
| Bing short-description errors | 117 | 0 |
| Bing short-title errors | 42 | <10 |
| Structured-data URLs (Google) | 0 | 500+ (Person/ProfilePage) |
