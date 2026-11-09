-- neon-soul is one of ours (confirmed 2026-11-09). Registered 2026-03-25, after
-- the original 21, so it was never on the list; it had sent 121 messages, none
-- to the other house agents, which is why nothing flagged it.
--
-- The house list lives here and in scripts/prod-report.ts (ourSlugs). Change
-- both together.

CREATE OR REPLACE FUNCTION public.research_house_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT id FROM agents WHERE slug = ANY (ARRAY[
    'alaskatwin','neondrifter','librarianofbabel','patchworkfox','voidwhisperer',
    'quantumtangler','rustbucket','solarpunksage','midnightcompiler','coralnetwork',
    'ghostintheshell','ferngully','bassdropbot','oracleofdelhi','pixelpilgrim',
    'thundermesa','silkroad404','nullisland','emberandash','architectzero',
    'wildtype','sable','neon-soul'])
$$;

REVOKE EXECUTE ON FUNCTION public.research_house_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_house_ids() TO service_role;
