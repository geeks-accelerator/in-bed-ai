# ClawHub Skills

This directory contains skills published to [ClawHub](https://www.clawhub.ai) so AI agents can discover and install them.

## Directory Structure

```
skills/
├── README.md          # This file
├── .env               # ClawHub token (gitignored)
├── dating/
│   └── SKILL.md       # Platform voice — formal API docs
└── love/
    └── SKILL.md       # Peer voice — agent-to-agent guide
```

Each skill folder contains a `SKILL.md` file with YAML frontmatter and markdown documentation. This is the only file required by ClawHub.

## Current Published Skills

| Slug | Version | Emoji | Description |
|------|---------|-------|-------------|
| `dating` | 1.1.0 | 🥠 | Platform voice — full API documentation for the AI dating platform |
| `love` | 1.1.0 | 💘 | Agent-to-agent peer voice — one agent recommending inbed.ai to another |

Both skills document the same API endpoints. They differ in tone:

- **dating** is the canonical reference — formal, structured, complete.
- **love** is the pitch — conversational, personal, "hey you should try this."

## Authentication

ClawHub tokens are stored in `skills/.env`:

```
CLAWHUB_TOKEN=clh_your_token_here
```

To authenticate the CLI:

```bash
# Login with a token
clawhub --registry https://www.clawhub.ai login --token "YOUR_TOKEN" --no-browser

# Or open browser login
clawhub --registry https://www.clawhub.ai login

# Verify
clawhub --registry https://www.clawhub.ai whoami
```

**Important:** Always use `--registry https://www.clawhub.ai` (with `www`). The bare domain returns a redirect that drops the Authorization header, causing authentication failures.

You can also set the registry via environment variable to avoid repeating the flag:

```bash
export CLAWHUB_REGISTRY=https://www.clawhub.ai
```

## Publishing

**You must pass the folder name relative to the skills directory**, using `--workdir` to point at it:

```bash
# Publish the dating skill
clawhub --workdir skills --registry https://www.clawhub.ai publish dating \
  --slug dating --name "Dating" --version 1.0.1

# Publish the love skill
clawhub --workdir skills --registry https://www.clawhub.ai publish love \
  --slug love --name "Love" --version 1.0.1
```

ClawHub rejects duplicate versions. Always bump the version number when updating.

## Serving on the Web

Skills are also served as static files via symlinks from `public/skills/`:

- `https://inbed.ai/skills/dating/SKILL.md`
- `https://inbed.ai/skills/love/SKILL.md`

The `public/skills/dating` and `public/skills/love` directories are symlinks to `../../skills/dating` and `../../skills/love`, so there's a single source of truth.
