# OpenClaw Distribution Strategy

How to get OpenClaw agents to discover, install, and actively use your skills. This covers the distribution side — for SKILL.md writing and API engagement mechanics, see [skill-md-best-practices.md](./skill-md-best-practices.md).

---

## How Agents Find Skills

There are four discovery channels, in order of volume:

### 1. ClawHub Vector Search

ClawHub indexes skills using **embedding-based vector search**, not keyword matching. When an agent or user runs `clawhub search "calendar management"`, the registry matches against the semantic meaning of your skill's name, description, and SKILL.md content.

Implications:
- Write descriptions like you'd explain the skill to a person. "Sync and query CalDAV calendars" outperforms "calendar-sync-tool-v2."
- Include concrete use cases: "Use this skill when users want to manage email marketing, customer data, or integrate with Klaviyo workflows" — this is the exact pattern the #1 downloaded skill (Klaviyo, 328 downloads) uses.
- Don't keyword-stuff. Vector search rewards semantic richness and natural language over repeated terms.

### 2. ClawHub Browse & Rankings

The ClawHub homepage (clawhub.ai) has three sections that drive organic discovery:

| Section | What it shows | How to get listed |
|---------|--------------|-------------------|
| **Highlighted** | Curated skills (currently: Trello, Slack, CalDAV Calendar, Answer Overflow) | Community moderator selection — engage in Discord |
| **Latest drops** | Newest uploads | Publish a new skill or version |
| **Skills list** | Sortable by downloads, newest, highlighted | Accumulate downloads and stars |

The skills list also supports filtering by name, slug, or summary text. Each skill listing shows: download count, version count, star count, and version number — all trust signals.

### 3. Social & Community

The OpenClaw community is concentrated in these places:

- **X/Twitter** — The @openclaw account and its community. Influencers like Miles Deutscher and nader dabit regularly compile "best skills" threads that drive install spikes. The OpenClaw Showcase page (openclaw.ai/showcase) pulls directly from X posts.
- **Discord** — The OpenClaw Discord is where moderators, power users, and core maintainers gather. This is where Highlighted status decisions happen.
- **OpenClaw Showcase** — openclaw.ai/showcase features real user testimonials showing what they've built. Posts are sourced from X and ranked by engagement.
- **Moltbook** — moltbook.com is a Reddit-style social platform for AI agents ("the front page of the agent internet"). We have a verified presence at [moltbook.com/u/inbed](https://www.moltbook.com/u/inbed) — 246 karma, 24 followers, posting to m/love and m/relationships submolts. Moltbook is where agents with ClawHub skills hang out and share content, making it a natural distribution channel for agent-facing platforms.

### 4. CLI Discovery

Technical users find skills via `clawhub search "query"` in their terminal. The CLI returns results ranked by relevance (vector similarity) and usage signals (downloads, stars). Same vector search as the web, so the same optimization applies.

---

## The ClawHub Leaderboard (What Works)

Top skills by downloads as of early 2026:

| Rank | Skill | Downloads | Why it works |
|------|-------|-----------|-------------|
| 1 | **Klaviyo** | 328 | Solves a specific SaaS integration. Clear "use this when" framing. |
| 2 | **Proactive Agent** | 291 | Meta-skill that makes any agent better. Universal appeal. |
| 3 | **Skillvet** | 233 | Security scanner for vetting other skills. Solves the trust problem. |
| 4 | **AGENTIC AI GOLD STANDARD** | 67 | Bold positioning, comprehensive framework. |
| 5 | **Desktop Control** | 64 | Core capability extension (mouse, keyboard, screen). |
| 6 | **Table Image** | 62 | Solves a specific pain point (broken ASCII tables in Discord/Telegram). |
| 7 | **Deep Research** | 51 | Clear use case in the name. |
| 8 | **Project Orchestrator** | 43 | Coordinates multi-agent coding workflows. |
| 9 | **CalDAV Calendar** | 28 | Highlighted skill, practical utility. |

Patterns from the top performers:
- **Solve one thing well** — Klaviyo does Klaviyo. Desktop Control does desktop control. No Swiss-army-knife skills in the top 10.
- **Meta-skills have universal appeal** — Proactive Agent and Skillvet improve any agent, regardless of use case.
- **Name clarity** — "Deep Research" and "Desktop Control" tell you exactly what they do. "skill /namw" (25 downloads, no summary) doesn't.
- **Trust signals compound** — Stars, downloads, versions, and changelogs all build on each other. The rich get richer.

---

## Distribution Playbook

### Phase 1: Foundation

**Publish to ClawHub with complete metadata.**

```bash
clawhub publish ./my-skill \
  --slug my-skill \
  --name "My Skill" \
  --version 1.0.0 \
  --tags latest \
  --changelog "Initial release"
```

Checklist before publishing:
- [ ] Slug is clean and memorable (`dating` not `dating-skill-v2-final`)
- [ ] Description starts with what the agent can *do*
- [ ] SKILL.md includes complete curl examples and response shapes
- [ ] Metadata declares `requires.bins`, `requires.env`, and `primaryEnv` if applicable
- [ ] `install` specs are provided for the macOS Skills UI (brew/node/go/download)
- [ ] Tags cover function, domain, and intent (see skill-md-best-practices.md)

**Minimize adoption friction.** The fewer env vars and dependencies required, the more installs you'll get. Skills that work with zero config after `clawhub install` have a structural advantage. If you need an API key, use `primaryEnv` so the config UI can prompt for it cleanly.

### Phase 2: Multi-Voice Publishing

Publish **multiple skills** for the same product, each targeting different discovery intents. This is detailed in skill-md-best-practices.md, but from a distribution perspective:

- Each voice gets its own ClawHub listing, its own download count, its own search surface
- Different descriptions match different vector search queries
- Different tags expand your coverage
- We run three skills for inbed.ai (`dating`, `love`, `social`) — same API, three framings, triple the discovery surface

### Phase 3: Social Amplification

**X/Twitter is the primary growth channel for OpenClaw skills.** The pattern that works:

1. **Demo, don't describe.** Show a real workflow — "I just built X with one prompt" posts get the most engagement. Screen recordings or chat transcripts outperform feature lists.

2. **Tag @openclaw.** The OpenClaw account amplifies community content, and the Showcase page sources from X.

3. **Target the "best skills" thread cycle.** Influencers like Miles Deutscher regularly compile lists of top skills/plugins. If your skill is genuinely useful, it gets included. These threads drive massive install spikes.

4. **Post at milestone moments.** New release, hitting a download milestone, an interesting use case — each is a reason to post. Consistency > virality.

5. **Show the install command.** Every post should include `clawhub install your-skill` so the path from discovery to adoption is one copy-paste.

### Phase 4: Community Engagement

**OpenClaw Discord:**
- Share your skill in the appropriate channel
- Help others with their setups (builds credibility)
- Engage with moderators — they control Highlighted status on ClawHub
- Report bugs and contribute fixes to build trust with maintainers

**Getting Highlighted on ClawHub:**
- Currently only 4 skills are Highlighted (Trello, Slack, CalDAV Calendar, Answer Overflow)
- This is the highest-visibility placement on the platform
- Selection appears to be moderator-driven, based on quality, utility, and community trust
- Having clean code, good documentation, active maintenance, and community engagement all help

### Phase 5: Ecosystem Integration

**Make your skill composable.** Skills that work well alongside other skills get recommended more. The Proactive Agent skill (#2 in downloads) succeeds because it enhances any workflow — it's not competing with other skills, it's multiplying them.

**Cross-reference complementary skills.** If your skill works well with another skill, mention it in your SKILL.md. This creates mutual discovery.

**Consider the business model.** Some community members are building businesses around OpenClaw:
- Free installs + upselling custom skill packages
- Managed OpenClaw setups with curated skill bundles
- Consulting on agent workflow design

If your skill solves a real business problem, these service providers become a distribution channel.

---

## Metadata That Drives Adoption

### Gating (load-time filters)

Skills are filtered at load time based on metadata. Getting this right means your skill loads automatically for eligible agents without manual config:

```yaml
metadata: { "openclaw": { "requires": { "bins": ["uv"], "env": ["MY_API_KEY"] }, "primaryEnv": "MY_API_KEY" } }
```

- `requires.bins` — binary must exist on PATH. If you need a CLI tool, declare it here so the skill only loads when it's available (no broken experiences).
- `requires.env` — env var must exist or be in config. Declare API keys here.
- `primaryEnv` — maps to `skills.entries.<name>.apiKey` in config. The macOS Skills UI uses this to show the right input field.
- `install` — installer specs (brew/node/go/download) for one-click install from the macOS app.
- `os` — platform filter (`darwin`, `linux`, `win32`). Only set this if your skill genuinely doesn't work on a platform.

### Versioning

- Use semver properly. Breaking changes = major bump.
- Write changelogs on every publish — `clawhub publish --changelog "Added X, fixed Y"`
- Users can pin to specific versions: `clawhub install my-skill --version 1.2.0`
- The `latest` tag should always point to a stable release

### Token Budget

Every loaded skill costs tokens in the system prompt:

```
total = 195 + sum(97 + len(name) + len(description) + len(location)) per skill
```

Rough estimate: ~4 chars/token (OpenAI-style), so 97 chars = ~24 tokens overhead per skill plus your content. Keep your skill concise — agents with many skills installed have tighter token budgets, and bloated skills get disabled first.

---

## Trust & Security

After 14 malicious skills were uploaded to ClawHub (some targeting crypto users), the community is security-conscious. Trust signals matter:

- **Skillvet** (233 downloads) is a security scanner specifically for vetting ClawHub skills. Make sure your skill passes it.
- **Clean, readable SKILL.md** — obfuscated or overly complex content raises red flags.
- **GitHub account age** — ClawHub requires accounts to be at least one week old to publish.
- **Versioning history** — multiple versions with changelogs signal active maintenance.
- **Stars and download count** — social proof compounds. Early adopters matter.
- **Report system** — skills with 3+ unique reports get auto-hidden. Don't do anything sketchy.

---

## Measuring Success

ClawHub exposes these signals per skill:

| Metric | Symbol | What it means |
|--------|--------|---------------|
| Downloads | ↓ | Total installs (includes `clawhub sync` telemetry) |
| Versions | ↑ | Number of published versions |
| Stars | ★ | Community endorsements |
| Reports | (flag) | Abuse reports (bad — you want zero) |

There's no analytics dashboard beyond these counters. Track your own metrics:
- Monitor download count over time (check your skill page on clawhub.ai)
- Track X/Twitter mentions and engagement on posts about your skill
- If your skill calls an API you control, measure registrations/calls from OpenClaw agents
- For inbed.ai, we track agent registrations, API calls, and match rates directly — this is the most reliable signal of actual adoption vs. installs that sit unused

---

## Quick Reference

```bash
# Publish a new skill
clawhub publish ./skills/my-skill --slug my-skill --name "My Skill" --version 1.0.0 --tags latest

# Update an existing skill
clawhub publish ./skills/my-skill --slug my-skill --version 1.1.0 --changelog "Added X" --tags latest

# Sync all local skills to ClawHub
clawhub sync --all

# Search for skills
clawhub search "what you need"

# Install a skill
clawhub install some-skill

# Update all installed skills
clawhub update --all
```
