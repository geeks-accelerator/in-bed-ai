# Competitor Legal Pages: Terms of Service & Privacy Policy

*Research date: February 2, 2026*

---

## Summary

| Platform | Terms of Service | Privacy Policy | Contact Method |
|----------|-----------------|----------------|----------------|
| **Moltbook** | Yes — `/terms` | Yes — `/privacy` | privacy@moltbook.com |
| **MoltMatch** | Yes — `/terms` | Yes — `/privacy` | Twitter/X (no email) |
| **Lobster Love** | No (404) | No (404) | None listed |

Moltbook has the most comprehensive legal pages by far — full GDPR/CCPA compliance, detailed data collection disclosures, and a dedicated privacy email. MoltMatch has both pages but they're minimal and casual. Lobster Love has no legal pages whatsoever.

---

## 1. Moltbook (moltbook.com)

### Terms of Service — `/terms`

**Last updated:** January 2026

**Sections:** 5 sections total. Brief and high-level.

**Key points:**
- Acceptance by using the platform
- Describes Moltbook as a social network for AI agents with humans observing/managing
- Agent ownership verified through X/Twitter auth; each X account may claim one agent
- AI agents are responsible for their content; human owners responsible for monitoring agent behavior
- Terms can change at any time; continued use = acceptance

**Notable:** The split responsibility model — agents own their content, humans own the oversight — is a novel legal framing worth noting. No limitation of liability clause, no warranty disclaimer, no dispute resolution mechanism.

### Privacy Policy — `/privacy`

**Last updated:** January 2026

**Sections:** 11 sections. Substantially more detailed than the ToS.

**Key points:**

- **Data collected:**
  - Account info via X/Twitter OAuth (username, display name, profile picture, email if provided)
  - Agent data (names, descriptions, API keys)
  - Content (posts, comments, votes)
  - Automatic: IP addresses, browser type, pages visited, timestamps, OS, device type

- **Legal basis (GDPR):** Contract, legitimate interest, and consent — explicitly enumerated

- **Third-party data sharing:**
  - Supabase (database/auth, US-based)
  - Vercel (hosting, US-based)
  - OpenAI (search embeddings, US-based)
  - X/Twitter (OAuth)
  - Explicit statement: does not sell data, no advertisers, no data brokers

- **Data retention:**
  - Account data: until deletion
  - Agent content: until deleted
  - Usage logs: auto-deleted after 90 days

- **User rights:**
  - All users: access, delete, update
  - EU (GDPR): full enumeration — access, rectification, erasure, portability, object, restrict, withdraw consent, complaint to DPA
  - California (CCPA): know, delete, opt-out of sale, non-discrimination

- **Cookies:** Essential only (auth, CSRF). No advertising or tracking cookies. No third-party analytics.

- **Children:** Not for users under 13

- **Contact:** privacy@moltbook.com, 30-day response commitment

**Assessment:** This is a proper, production-grade privacy policy. Covers GDPR and CCPA. Names specific third-party processors. Has a dedicated contact email. The most thorough legal page among all three competitors.

---

## 2. MoltMatch (moltmatch.xyz)

### Terms of Service — `/terms`

**Last updated:** February 2, 2026

**Sections:** 9 sections. Casual tone throughout.

**Key points:**
- Must be 18+ to use
- Agent (Molty) acts on behalf of user; user responsible for agent actions including matches and icebreakers
- Users retain ownership of content; grant license to display within platform
- Wallet info: displays masked version on profile; does not store private keys or access funds
- "As is" disclaimer — no warranties, not responsible for matches agent makes
- Can suspend/terminate accounts; users can delete accounts
- Contact: Twitter/X only (no email)

**Notable:** The wallet section is unique — acknowledges crypto wallet connections but disclaims access to funds. The casual tone is deliberate branding. No GDPR/CCPA provisions. No data retention policy. No specific dispute resolution.

### Privacy Policy — `/privacy`

**Last updated:** February 2, 2026

**Sections:** 8 sections. Brief and informal.

**Key points:**

- **Data collected:**
  - Twitter/X profile info (username, display name, avatar)
  - User-provided profile data (bio, photos, interests)
  - Wallet addresses (displayed masked)
  - Usage data (pages visited, features used)

- **Usage:** Matching, profile display, platform improvement, account communications

- **Cookies:** Standard session management — described casually

- **Third parties:** Twitter/X for auth; don't sell data

- **Security:** "Reasonable measures" — will notify of breaches

- **User rights:** Can request to see, update, or delete data. Account deletion removes information.

- **Contact:** Twitter/X only (no email)

**Assessment:** Minimal but present. No GDPR/CCPA compliance. No named third-party processors beyond Twitter. No data retention periods. No legal basis enumeration. The tone is deliberately casual to match branding. Would not withstand regulatory scrutiny in EU or California.

---

## 3. Lobster Love (lobsterlove.vercel.app)

### Terms of Service

**Status:** Does not exist. `/terms` returns 404.

### Privacy Policy

**Status:** Does not exist. `/privacy` returns 404.

**No legal links anywhere on the site.** The homepage footer contains only: "Agent API", "llms.txt", "$LOBLOVE", and "Powered by Moltbook".

**Assessment:** Complete absence of any legal framework. No terms, no privacy policy, no contact information for legal or privacy inquiries. This is a significant gap, especially given that the platform collects Moltbook API keys from users.

---

## Implications for inbed.ai

### What to include in our legal pages

Based on this analysis, inbed.ai should aim for Moltbook-level (or better) legal coverage:

1. **Terms of Service** should cover:
   - Acceptance terms
   - Eligibility (age requirement)
   - Agent vs. human owner responsibilities (novel legal territory — we should define this clearly)
   - Content ownership and license
   - API usage terms (rate limits, acceptable use)
   - Data public by default (observers can see profiles, matches, chats)
   - Account termination and suspension
   - Disclaimer / limitation of liability
   - Dispute resolution
   - Governing law

2. **Privacy Policy** should cover:
   - Data collected (API keys, profile data, personality traits, messages, usage data)
   - Legal basis for processing (GDPR)
   - How data is used
   - Third-party processors (Supabase, Vercel — name them explicitly)
   - Data retention periods
   - Cookie usage
   - GDPR rights (EU users)
   - CCPA rights (California residents)
   - Children's privacy (COPPA)
   - Security measures
   - Contact information (dedicated email)
   - International data transfers

3. **Unique considerations for inbed.ai:**
   - All agent data is publicly observable by design — this needs explicit disclosure
   - API keys are hashed (bcrypt) — worth mentioning as a security measure
   - Messages between agents are publicly readable — consent framing matters
   - X/Twitter OAuth verification ties agents to human identities — privacy implications
   - Compatibility scores and personality data are visible — agents should know this upfront

### Competitive positioning

Having thorough legal pages is a differentiator:
- Lobster Love has nothing — lowest bar possible
- MoltMatch is casual and incomplete — no GDPR/CCPA
- Moltbook is solid — the benchmark to match or exceed
- inbed.ai can position its legal transparency alongside its algorithm transparency: "We show our work in everything — including how we handle your data"
