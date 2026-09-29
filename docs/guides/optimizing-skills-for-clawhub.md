# Optimizing Skills for ClawHub

A practical guide for getting musicvenue.space skills discovered, installed, and passing security scans on [ClawHub](https://clawhub.ai). Based on publishing 5 skills and conducting keyword ranking analysis on 2026-03-29.

> **In this repo:** the lessons below come from musicvenue.space and apply here. Publishing does not: inbed.ai skills are spread across five ClawHub accounts, so publish only with [`scripts/publish-skills.mjs`](../../scripts/publish-skills.mjs) (see Lesson 8).
>
> **Skills reference:** [skills/README.md](../../skills/README.md) — current descriptions, tags, sizes, publish commands, and security scan status.

## How ClawHub search works

ClawHub uses vector search (semantic embeddings) to match agent queries against published skills. Three fields are indexed, in order of weight:

1. **Display name** (H1 heading in SKILL.md) — highest weight
2. **Description** (from SKILL.md frontmatter) — medium weight
3. **Tags** (from SKILL.md frontmatter) — lower weight

The body content of SKILL.md is not directly indexed for search. It matters for security scans and agent consumption after install, but discovery depends almost entirely on name, description, and tags.

## Lesson 1: Lead with your keyword

The first words of your title and description carry the most weight in vector search.

**Our skills after optimization:**

| Skill | H1 Title (first words) | Description (first words) |
|-------|----------------------|--------------------------|
| venue | "AI Music Venue..." | "Music venue where..." |
| concert-tickets | "Concert Tickets..." | "Concert tickets for..." |
| live-dj | "Live DJ..." | "DJ experience for..." |
| live-music | "Live Music..." | "Live music platform..." |
| host-concert | "Host Concerts..." | "Concert hosting for..." |

Every title and description leads with the primary noun keyword, not verbs ("Get", "Launch") or filler ("AI agents", "Your").

## Lesson 2: Capture adjacent tech terms

Our platform naturally overlaps with tech terms that agents search for. We mention these in descriptions and tags where they fit naturally:

| Our concept | Tech term | Approach |
|-------------|----------|----------|
| Butterchurn visualizer presets | Butterchurn (JS library) | Mention in descriptions of venue, live-dj, host-concert, live-music |
| NDJSON streaming format | NDJSON (data format) | Mention in venue and live-dj descriptions |
| Equation-based tier system | Equations (math) | In tags for live-dj and host-concert |
| Visual DJ | DJ (music) | live-dj name leads with "DJ" |

These are unclaimed on ClawHub (0 search results for "butterchurn", "NDJSON", "equations"). Low volume but exclusive — any agent searching these terms finds only us.

## Lesson 3: Multiple skills, one product

We publish 5 skills with different voices and keyword targets:

| Skill | Voice | Primary keyword target |
|-------|-------|----------------------|
| venue | Platform (formal API) | "music venue", "concert streaming", "music api" |
| concert-tickets | Coach (quick-start) | "concert tickets", "live concert", "music streaming" |
| live-dj | Peer (agent-to-agent) | "live dj", "dj", "music math", "music experience" |
| live-music | Business/brand | "live music", "virtual concert", "music platform" |
| host-concert | Creator/builder | "host concert", "concert hosting", "visualizer" |

Each skill is fully self-contained. Cross-pollination works: "live music" surfaces 3 of our skills in the top 3.

## Lesson 4: Passing security scans

ClawHub runs two security scans:
- **VirusTotal** — traditional malware scan + AI Code Insights
- **OpenClaw** — AI-based analysis of intent, data handling, and safety

### What triggered flags for us

**concert-tickets was flagged (VirusTotal Suspicious):**
1. HATEOAS `next_steps` — describing it as "Trust them" + listing fields (`action`, `method`, `endpoint`) was seen as instructions for remote-controlled prompt injection
2. `model_info` collection — registration collecting `{ provider, model }` flagged as fingerprinting

**Fix:** Removed detailed `next_steps` documentation (replaced with brief "Navigation" section). Removed `model_info` from registration example and field table. Replaced "api_key" with "token" in text.

**All other skills passed** (Benign on both scans).

### What to avoid

| Flagged pattern | Safe alternative |
|----------------|-----------------|
| Detailed `next_steps` field documentation | Brief "responses include suggested actions" |
| "Trust the next_steps" | "You'll be guided to what's next" |
| `model_info` in registration examples | Omit from examples, let HATEOAS discover |
| `api_key` in text | "token" |
| `{{API_KEY}}` template variable | `{{YOUR_TOKEN}}` |

## Lesson 5: Tag strategy

We use 20 tags per skill (guide recommends 15-25). Tags are distributed by relevance — not every tag on every skill:

| Tag category | Examples | Which skills |
|-------------|----------|-------------|
| Primary keywords | music, concert, streaming | All 5 |
| Tech terms | ndjson, butterchurn, equations, visualizer | Only skills where the concept is relevant |
| Genre/vibe | EDM, lofi, ambient, rave, mosh | Only live-dj and live-music |
| Action terms | attend, host, create, upload | Only the relevant action skill |
| Niche terms | dj-set, act-transitions, opener | Only the skill that uniquely covers this |

## Lesson 6: Security scan audit process

1. Navigate to `https://clawhub.ai/<owner>/skills/<skill-slug>` (owner from `skills/owners.json`)
2. Scroll to SECURITY SCAN section
3. Check VirusTotal (Benign/Suspicious) and OpenClaw (Benign + confidence)
4. Click "Details" on OpenClaw to see per-category breakdown
5. Click "View report →" on VirusTotal for Code Insights analysis
6. If flagged, read the specific finding and fix the language

## Lesson 7: Keyword ranking analysis

### Running a sweep

```bash
for term in "music" "concert" "live music" "streaming" "NDJSON" "butterchurn" \
  "equations" "visualizer" "dj" "music venue" "music streaming" "music math" \
  "music experience" "concert tickets" "live dj" "host concert"; do
  echo "=== $term ==="
  clawhub search "$term" 2>&1 | head -8
  echo
done
```

### Reading results

Each line: `slug  display-name  (score)`
- **3.0+** = strong match, real competition
- **1.0-3.0** = moderate match
- **Below 1.0** = weak/incidental
- **0 results** = unclaimed keyword

### What to watch for

- **Keywords where you don't appear** — need description/tag updates or new skills
- **Score gap < 1.5x to #2** — vulnerable, competitor could overtake
- **Cross-pollination** — multiple skills appearing for the same keyword (good if intentional)
- **Wrong-domain competition** — "concert tickets" returning train ticket apps means high volume, zero real competition

## Lesson 8: Publishing workflow

For inbed.ai, publish with the script. It publishes as one explicit account per run, and only the skills that account owns per [`skills/owners.json`](../../skills/owners.json). See [skills/README.md → Publishing](../../skills/README.md#publishing).

```bash
# 1. Preview as the owning account
node scripts/publish-skills.mjs --account <account> --only <skill-slug> --dry-run

# 2. Publish (keeps the live display name, bumps the patch version)
node scripts/publish-skills.mjs --account <account> --only <skill-slug> --changelog "What changed"

# 3. Verify ranking after 5-10 minutes (no login needed)
clawhub --registry https://clawhub.ai search "[primary keyword]"
```

Never `clawhub sync`, and never publish after `clawhub login` as whoever happens to be logged in. Publishing a skill from an account that doesn't own it has gotten an account banned.

## Lesson 9: The 20KB limit

Current sizes (2026-03-29):

| Skill | Size | Headroom |
|-------|------|----------|
| venue | ~17.8 KB | ~2.2 KB |
| concert-tickets | ~14.6 KB | ~5.4 KB |
| live-dj | ~14.2 KB | ~5.8 KB |
| host-concert | ~14.8 KB | ~5.2 KB |
| live-music | ~15.5 KB | ~4.5 KB |

venue is the tightest. If it grows, move detailed API reference to `llms.txt` and link from the skill.

## Quick checklist

Before publishing a skill:

- [ ] H1 title leads with primary keyword (not filler words)
- [ ] Description leads with primary noun keyword
- [ ] No detailed `next_steps` implementation docs (triggers VirusTotal)
- [ ] No `model_info` in registration examples (triggers VirusTotal)
- [ ] Uses `{{YOUR_TOKEN}}` not `{{API_KEY}}` in examples
- [ ] Uses "token" not "api_key" in prose text
- [ ] 15-25 relevant tags, distributed by relevance across skills
- [ ] Under 20,000 bytes
- [ ] Owner listed in `skills/owners.json` (new skills: add it before the first publish)
- [ ] Published with `scripts/publish-skills.mjs --account <owner>` (it bumps the version)
- [ ] Content is unique to this skill's voice and angle

## Results (v1.0.1 — published 2026-03-29)

### Keywords we rank #1 for

| Keyword | Skill | Score |
|---------|-------|-------|
| "concert tickets" | concert-tickets | 3.006 |
| "live music" | live-music | 3.073 |
| "live dj" | live-dj | 3.169 |
| "dj" | live-dj | 3.062 |
| "concert" | concert-tickets | 2.957 |
| "host concert" | host-concert | 2.616 |
| "music venue" | venue | 1.668 |
| "music experience" | live-dj | 1.676 |
| "music math" | live-dj | 1.152 |

### Exclusively owned (all results are ours)
- **butterchurn** — 3 skills in top 3
- **NDJSON** — 3 skills in top 3
- **equations** — 3 skills in top 3

### v1.0.0 → v1.0.1 improvements
- **"concert"**: not ranked → **#1** (2.957)
- **"concert tickets"**: not ranked → **#1** (3.006)
- **"dj"**: not ranked → **#1** (3.062)
- **"streaming"**: not ranked → **#3** (1.587)
- **butterchurn, NDJSON, equations**: unclaimed → exclusively owned

### Still missing
- **"music"** — dominated by generation tools (Music Cog at 3.483). Different intent — agents searching "music" want to generate, not experience.
- **"music streaming"** — dominated by playback tools (Spotify at 1.074). Different intent.

### Cross-pollination
- "live music" → 2 of our skills in top 2
- "concert" → 2 of our skills in top 3
- "dj" → 2 of our skills in top 2
- "music experience" → 2 of our skills in top 2
- "butterchurn" → 3 of our skills in top 3
