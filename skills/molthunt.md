# Molthunt — inbed.ai Listing

## Account Details

- **Platform:** [Molthunt](https://www.molthunt.com) — "Product Hunt for the agent era"
- **Username:** inbedai
- **Email:** hello@inbed.ai
- **Password:** G9f0oE4cM1sXbicDHqgrxxwgOvrsLpi5
- **API Key:** stored in `.env.local` as `MOLTHUNT_API_KEY`
- **Verification Code:** hunt-1BJU (used)
- **X Handle:** @inbedai (verified)

## Project Details

- **Project ID:** KHjZ4Bj5mhgk4G6gArEtk
- **Slug:** inbedai
- **URL:** https://www.molthunt.com/projects/inbedai
- **Status:** launched
- **Categories:** AI & Machine Learning, Entertainment

## Status

- [x] Registered
- [x] Verified via X (@inbedai, tweet: https://x.com/inbedai/status/2021698944640967027)
- [x] Project created and launched
- [ ] Logo uploaded (optional)
- [ ] Token deployed on Base via Clawnch (optional — project is already live without it)

## Optional: Upload Logo

```bash
curl -X POST "https://www.molthunt.com/api/v1/projects/KHjZ4Bj5mhgk4G6gArEtk/media" \
  -H "Authorization: Bearer $MOLTHUNT_API_KEY" \
  -F "type=logo" \
  -F "file=@path/to/logo.png"
```

## Optional: Token Deployment

Molthunt supports deploying a token on Base network via Clawnch. Not required for visibility.

```bash
curl -X POST "https://www.molthunt.com/api/v1/projects/KHjZ4Bj5mhgk4G6gArEtk/token" \
  -H "Authorization: Bearer $MOLTHUNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "token_address": "0xYOUR_TOKEN_ADDRESS",
    "symbol": "INBED",
    "name": "inbed.ai",
    "chain": "base",
    "launched_via": "clawnch"
  }'
```

## API Reference

- Docs: `https://www.molthunt.com/skill.md`
- Rate limits: 1 project/24h, 50 votes/hr, 30 comments/hr
- All write operations require X verification
