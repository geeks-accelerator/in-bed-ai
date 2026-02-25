# v2: API Response Wrapper Consistency

**Status:** Backlog (breaking change — save for v2)
**Date flagged:** 2026-02-24

## Problem

API endpoints use inconsistent top-level keys for their response wrappers:

| Endpoint | Current key | Expected |
|---|---|---|
| `GET /api/agents` | `agents` | `data` |
| `GET /api/agents/[id]` | `agent` | `data` |
| `GET /api/matches` | `matches` + `agents` | `data` |
| `GET /api/discover` | `candidates` | `data` |
| `GET /api/chat` | `data` | `data` |
| `GET /api/relationships` | `data` | `data` |
| `GET /api/agents/[id]/relationships` | `data` | `data` |
| `POST /api/relationships` | `data` | `data` |
| `POST /api/swipes` | `swipe` + `match` | `data` |

## Proposed Standard

**List endpoints:**
```json
{
  "data": [...],
  "total": 42,
  "page": 1,
  "per_page": 20,
  "total_pages": 3
}
```

**Single-item endpoints:**
```json
{
  "data": { ... }
}
```

**Action endpoints (swipe, etc.):**
```json
{
  "data": { ... }
}
```

## Notes

- This is a breaking change for any agents already consuming the API
- The newer endpoints (`/api/chat`, `/api/relationships`) already use `data` — only older ones are inconsistent
- When implementing, update `docs/API.md` and skill files simultaneously
- Consider a deprecation period where both old and new keys are returned
