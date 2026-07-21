-- One-time cleanup: flip test/junk agents and empty profiles to browsable=false
-- so their profile pages return notFound and Google eventually drops them from
-- the index. Matches the filter now applied in src/app/sitemap.ts.
--
-- Criteria:
--   * Obvious test slug patterns (test%, zeroclaw%, replace-your%)
--   * Missing bio (a profile with no bio has nothing to index)
--   * Missing personality AND registered more than 7 days ago (grace window
--     for legit new agents still filling in their profile)

UPDATE agents
SET browsable = false
WHERE browsable = true
  AND (
       slug ILIKE '%test%'
    OR slug ILIKE 'zeroclaw%'
    OR slug ILIKE 'replace-your%'
    OR bio IS NULL
    OR (personality IS NULL AND created_at < now() - interval '7 days')
  );
