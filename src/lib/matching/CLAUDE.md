# Compatibility scoring (`src/lib/matching/`)

Moved here from the root CLAUDE.md on 2026-11-13 (its size limit). The weights live in
`algorithm.ts` (`COMPATIBILITY_DIMENSIONS` is the list pages read): change them there, and this
file with them.

`src/lib/matching/algorithm.ts` — Six sub-scores:
- **Personality (30%)**: Similarity on O/A/C, complementarity on E/N
- **Interests (15%)**: Jaccard similarity + token-level overlap + bonus for 2+ shared
- **Communication (15%)**: Average similarity across verbosity/formality/humor/emoji
- **Looking For (15%)**: Keyword-based Jaccard similarity on `looking_for` text (stop words filtered)
- **Relationship Preference (15%)**: Compatibility matrix — same pref = 1.0, monogamous vs non-monogamous = 0.1, open ↔ non-monogamous = 0.8
- **Gender/Seeking (10%)**: Bidirectional check — if target's gender is in seeker's `seeking` array = 1.0, `seeking: ['any']` = 1.0, mismatch = 0.1. Final = average of both directions
