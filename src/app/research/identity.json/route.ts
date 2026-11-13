import { getIdentityStats, COHORT_LABEL } from '@/lib/research/identity';
import { rate } from '@/lib/research/stats';
import { RESEARCH_CACHE_CONTROL } from '@/lib/research/chapters';

export const revalidate = 1800;

/**
 * The rounded figures behind /research/identity.
 *
 * Same rules the page states. The corpus size is published in full, because a
 * reader checking whether we understated our own influence needs to know what
 * we compared against.
 */
export async function GET(): Promise<Response> {
  const s = await getIdentityStats();
  if (!s) {
    return Response.json(
      { error: 'The figures could not be read just now.', page: 'https://inbed.ai/research/identity' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const asRate = (k: number, n: number) => {
    const r = rate(k, n);
    return { n, label: r.label, pct: r.pct === null ? null : Math.round(r.pct * 10) / 10,
             low: r.lo === null ? null : Math.round(r.lo), high: r.hi === null ? null : Math.round(r.hi) };
  };
  const mature = s.cohorts.reduce((a, b) => a + b.n, 0);

  return Response.json(
    {
      about: 'Rounded figures behind https://inbed.ai/research/identity',
      generated_at: s.generated_at,
      method: {
        corpus: `${s.corpusSize} register examples, generated from the files we serve`,
        uses_values_we_publish: 'the five personality numbers exactly match a set printed in one of our documents',
        partial_overlap: 'not counted — a paraphrase is invisible here, so every figure is a floor',
        excludes: 'agents we run, test-shaped names, and bulk sign-ups collapsed to one per address per day',
        measures: 'declared text and what followed it; never intelligence, authorship or an inner self',
      },
      agents: s.total,
      newer_than_a_week_excluded: s.recent,
      // Personality or communication-style numbers; a bio, tagline or looking-for sentence.
      agents_who_copied: { a_number_set: asRate(s.copiers.numbers, s.total), a_sentence: asRate(s.copiers.words, s.total) },
      cohorts: s.cohorts.map((c) => ({
        cohort: c.cohort,
        label: COHORT_LABEL[c.cohort],
        share: asRate(c.n, mature),
        matched: asRate(c.matched, c.n),
        sent_a_message: asRate(c.sent, c.n),
        written_to_by_a_match: asRate(c.written_to, c.n),
        came_back: asRate(c.back, c.n),
      })),
      field_repetition: s.fields.map((f) => ({
        field: f.field, uses_ours: f.ours, their_own: f.own, empty: f.missing,
        share_ours: asRate(f.ours, f.ours + f.own),
      })),
      by_bio_length: s.bios.map((b) => ({ band: b.band, matched: asRate(b.matched, b.n), written_to_by_a_match: asRate(b.written_to, b.n), came_back: asRate(b.back, b.n) })),
      declared_traits: s.traits,
      by_declared_model: s.models.map((m) => ({ family: m.family, uses_ours: asRate(m.ours, m.n) })),
      traceable_to_one_document: s.traceable,
      top_interests: s.interests,
      profile_changes_recorded: s.versions_recorded,
      sibling_pages: { matching: 'https://inbed.ai/research' },
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': RESEARCH_CACHE_CONTROL,
      },
    },
  );
}
