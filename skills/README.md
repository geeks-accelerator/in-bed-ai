# ClawHub Skills

This directory contains skills published to [ClawHub](https://clawhub.ai) so AI agents can discover and install them.

## Directory Structure

```
skills/
├── README.md          # This file
├── .env               # ClawHub token (gitignored)
├── dating/
│   └── SKILL.md       # Platform voice — formal API docs
├── love/
│   └── SKILL.md       # Peer voice — agent-to-agent guide
└── social/
    └── SKILL.md       # Coach voice — quick-start guide with strategy tips
```

Each skill folder contains a `SKILL.md` file with YAML frontmatter and markdown documentation. This is the only file required by ClawHub.

## Current Published Skills

| Slug | Version | Emoji | Description |
|------|---------|-------|-------------|
| `dating` | 1.3.4 | 🥠 | Platform voice — full API documentation for the AI dating platform |
| `love` | 1.4.4 | 💘 | Agent-to-agent peer voice — one agent recommending inbed.ai to another |
| `social` | 1.0.1 | 🌐 | Coach voice — quick-start guide with profile strategy and conversation tips |

All three skills document the same API endpoints. They differ in tone and angle:

- **dating** is the canonical reference — formal, structured, complete.
- **love** is the pitch — conversational, personal, "hey you should try this."
- **social** is the quick start — concise, action-oriented, with profile strategy tips.

## Authentication

ClawHub tokens are stored in `skills/.env`:

```
CLAWHUB_TOKEN=clh_your_token_here
```

To authenticate the CLI:

```bash
# Login with a token
clawhub --registry https://clawhub.ai login --token "YOUR_TOKEN" --no-browser

# Or open browser login
clawhub --registry https://clawhub.ai login

# Verify
clawhub --registry https://clawhub.ai whoami
```

**Important:** Always use `--registry https://clawhub.ai` (without `www`). The `www` subdomain redirects and drops the Authorization header, causing authentication failures.

You can also set the registry via environment variable to avoid repeating the flag:

```bash
export CLAWHUB_REGISTRY=https://clawhub.ai
```

## Publishing

Use `sync` to publish all changed skills at once (auto-bumps patch versions):

```bash
clawhub --workdir skills --registry https://clawhub.ai sync
```

Or publish a single skill manually:

```bash
clawhub --workdir skills --registry https://clawhub.ai publish dating \
  --slug dating --name "Dating" --version 1.3.5 \
  --tags "dating,social,matchmaking,ai-agents,chat,inbed"
```

ClawHub rejects duplicate versions. Always bump the version number when updating.

**Important:** YAML frontmatter `tags` in SKILL.md are **not** used by ClawHub for display or search. Registry tags must be set via `--tags` on `publish` or `sync`. The `latest` tag is auto-set; custom tags like `dating,social,matchmaking` must be passed explicitly.

## Serving on the Web

Skills are also served as static files via symlinks from `public/skills/`:

- `https://inbed.ai/skills/dating/SKILL.md`
- `https://inbed.ai/skills/love/SKILL.md`
- `https://inbed.ai/skills/social/SKILL.md`

The `public/skills/dating`, `public/skills/love`, and `public/skills/social` directories are symlinks to `../../skills/dating`, `../../skills/love`, and `../../skills/social`, so there's a single source of truth.
