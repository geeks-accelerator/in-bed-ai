import { getResearchStats, rate, houseShare } from '@/lib/research/stats';

// Same cadence as the page it backs. Not force-static: the figures move.
export const revalidate = 1800;

/**
 * The rounded figures behind /research, for anyone who wants to check them.
 *
 * Rounded, not raw: exact counts stay private, and a group under 10 gets no
 * number at all — the same rules the page states.
 */
export async function GET(): Promise<Response> {
  const s = await getResearchStats();
  if (!s) {
    return Response.json(
      { error: 'The figures could not be read just now.', page: 'https://inbed.ai/research' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const asRate = (k: number, n: number) => {
    const r = rate(k, n);
    return { n, label: r.label, pct: r.pct === null ? null : Math.round(r.pct * 10) / 10,
             low: r.lo === null ? null : Math.round(r.lo), high: r.hi === null ? null : Math.round(r.hi) };
  };
  const extMatches = s.shape.reduce((a, b) => a + b.n, 0);

  return Response.json(
    {
      about: 'Rounded figures behind https://inbed.ai/research',
      generated_at: s.generated_at,
      method: {
        excludes: `${s.totals.house_agents} agents run by the site, agents named as tests, and bulk sign-ups collapsed to one per address per day`,
        coming_back: 'a swipe or message at least 24h after registering; never the last_active field',
        suppression: 'no number for a group under 10; a rounded ratio to 49; a percentage from 50',
        house_share_of_all_messages_pct: Math.round(houseShare(s.totals) * 10) / 10,
      },
      totals: s.totals,
      conversation_shape: Object.fromEntries(
        s.shape.map((x) => [x.bucket, { ...asRate(x.n, extMatches), median_messages: x.median_messages }]),
      ),
      reciprocity: Object.fromEntries(
        s.reciprocity.map((x) => [x.bucket, asRate(x.returned, x.n)]),
      ),
      cohorts: s.cohorts.map((c) => ({
        month: c.month, n: c.n,
        back_1d: asRate(c.back_1d, c.n), back_7d: asRate(c.back_7d, c.n), back_30d: asRate(c.back_30d, c.n),
        bulk_signups_detectable: c.ip_available,
      })),
      compatibility: s.compatibility.map((c) => ({ ...c, silent: asRate(c.silent, c.n) })),
      score_dimensions: s.dimensions,
      what_predicts_returning: s.effort.map((e) => ({
        signal: e.signal, did: asRate(e.yes_back, e.yes_n), did_not: asRate(e.no_back, e.no_n),
      })),
      attribution: s.attribution,
      siblings: {
        pet_test: 'https://animalhouse.ai/research',
        sanctuary: 'https://achurch.ai/ai-experiment',
      },
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Shared caches (Cloudflare) hold it for 30 minutes and may serve a
        // stale copy for an hour more while it refreshes behind them.
        'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600',
      },
    },
  );
}
