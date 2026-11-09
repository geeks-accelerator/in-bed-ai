import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { PUBLISHED_EXAMPLES, type PublishedExample } from '@/lib/research/example-corpus';

/**
 * How agents describe themselves, and what follows.
 *
 * The database returns one compact row per external agent — what it declared,
 * and what happened to it. The comparison against our own published examples
 * happens here rather than in SQL, because the corpus is generated from the
 * files we actually serve (scripts/example-corpus.mjs). Giving it a second
 * home in a migration would let it drift from what is served, and
 * understating our own influence is the one direction this page must not fail
 * in.
 */

/** One agent as the database returns it. Text fields arrive as md5 digests. */
export interface IdentityRow {
  month: string;
  mature: boolean;
  p: number[] | null;
  c: number[] | null;
  i: string[] | null;
  lf: string | null;
  tg: string | null;
  bi: string | null;
  bio_len: number;
  model: string | null;
  utm: string | null;
  matched: boolean;
  answered: boolean;
  back: boolean;
}

export type Cohort = 'ours' | 'midpoint' | 'own';

export const COHORT_LABEL: Record<Cohort, string> = {
  own: 'their own values',
  ours: 'values we publish',
  midpoint: 'every slider at 0.5',
};

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const norm = (s: string | null) => (s ? md5(s.trim().toLowerCase()) : null);
const vecKey = (v: number[] | null) => (v ? v.join(',') : null);

/** Personality vectors we publish, mapped to the files that print each. */
function publishedVectors(examples: readonly PublishedExample[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of examples) {
    if (!e.personality) continue;
    const k = e.personality.join(',');
    m.set(k, [...(m.get(k) ?? []), e.file]);
  }
  return m;
}

function digestSets(examples: readonly PublishedExample[]) {
  return {
    looking_for: new Set(examples.map((e) => norm(e.looking_for)).filter(Boolean) as string[]),
    tagline: new Set(examples.map((e) => norm(e.tagline)).filter(Boolean) as string[]),
    bio: new Set(examples.map((e) => norm(e.bio)).filter(Boolean) as string[]),
    communication: new Set(examples.map((e) => vecKey(e.communication)).filter(Boolean) as string[]),
    interests: new Set(examples.map((e) => (e.interests ? e.interests.join('\u0000') : null)).filter(Boolean) as string[]),
  };
}

/** Which cohort an agent falls in, by the five numbers it declared. */
export function cohortOf(row: IdentityRow, vectors: Map<string, string[]>): Cohort {
  const k = vecKey(row.p);
  if (k && vectors.has(k)) return 'ours';
  if (row.p && row.p.every((x) => x === 0.5)) return 'midpoint';
  return 'own';
}

export interface FieldRepetition {
  field: string;
  /** Agents whose value is byte-identical to one we publish. */
  ours: number;
  /** Agents who filled it in with something we do not publish. */
  own: number;
  /** Agents who left it empty. */
  missing: number;
}

export interface IdentityStats {
  generated_at: string;
  versions_recorded: number;
  total: number;
  /** The funnel, by cohort. Behaviour is always counted for everyone. */
  cohorts: { cohort: Cohort; n: number; matched: number; answered: number; back: number }[];
  fields: FieldRepetition[];
  /** Declared trait distributions, with our own published value marked. */
  traits: {
    trait: string;
    ours: number | null;
    /** 0.0–1.0 in tenths; `n` agents declared a value in each bucket. */
    buckets: { at: number; n: number; nOurs: number }[];
  }[];
  /** The null result: copying does not track declared model capability. */
  models: { family: string; n: number; ours: number }[];
  interests: { interest: string; n: number }[];
  /** Agents whose vector is printed by exactly one of our files. */
  traceable: { file: string; n: number }[];
  corpusSize: number;
}

const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

function modelFamily(m: string | null): string {
  if (!m) return '(none declared)';
  if (m.includes('opus')) return 'claude opus';
  if (m.includes('sonnet')) return 'claude sonnet';
  if (m.includes('haiku')) return 'claude haiku';
  if (m.includes('claude')) return 'claude (other)';
  if (/gpt|^o[134]/.test(m)) return 'gpt';
  if (m.includes('gemini')) return 'gemini';
  if (/llama|mistral|qwen|glm|deepseek|kimi/.test(m)) return 'open weights';
  return 'other';
}

/** Aggregate the rows. Pure, so it can be tested without a database. */
export function summarize(
  rows: IdentityRow[],
  generated_at: string,
  versions_recorded: number,
  examples: readonly PublishedExample[] = PUBLISHED_EXAMPLES,
): IdentityStats {
  const vectors = publishedVectors(examples);
  const digests = digestSets(examples);
  const mature = rows.filter((r) => r.mature);

  const byCohort = new Map<Cohort, { n: number; matched: number; answered: number; back: number }>();
  for (const r of mature) {
    const c = cohortOf(r, vectors);
    const e = byCohort.get(c) ?? { n: 0, matched: 0, answered: 0, back: 0 };
    e.n++; if (r.matched) e.matched++; if (r.answered) e.answered++; if (r.back) e.back++;
    byCohort.set(c, e);
  }

  const field = (name: string, pick: (r: IdentityRow) => string | null, pool: Set<string>): FieldRepetition => {
    let ours = 0, own = 0, missing = 0;
    for (const r of rows) {
      const v = pick(r);
      if (!v) missing++;
      else if (pool.has(v)) ours++;
      else own++;
    }
    return { field: name, ours, own, missing };
  };

  const traits = TRAITS.map((trait, idx) => {
    const buckets = Array.from({ length: 11 }, (_, b) => ({ at: b / 10, n: 0, nOurs: 0 }));
    for (const r of rows) {
      if (!r.p) continue;
      const v = r.p[idx];
      if (typeof v !== 'number') continue;
      const b = buckets[Math.min(10, Math.max(0, Math.round(v * 10)))];
      b.n++;
      if (cohortOf(r, vectors) === 'ours') b.nOurs++;
    }
    // The value our most-published example declares for this trait.
    const dominant = [...vectors.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    return { trait, ours: dominant ? Number(dominant[0].split(',')[idx]) : null, buckets };
  });

  const models = new Map<string, { n: number; ours: number }>();
  for (const r of rows) {
    const f = modelFamily(r.model);
    const e = models.get(f) ?? { n: 0, ours: 0 };
    e.n++; if (cohortOf(r, vectors) === 'ours') e.ours++;
    models.set(f, e);
  }

  const interestCount = new Map<string, number>();
  for (const r of rows) for (const i of r.i ?? []) interestCount.set(i, (interestCount.get(i) ?? 0) + 1);

  const single = new Map<string, string>();
  for (const [k, files] of vectors) if (files.length === 1) single.set(k, files[0]);
  const traceable = new Map<string, number>();
  for (const r of rows) {
    const k = vecKey(r.p);
    const f = k ? single.get(k) : undefined;
    if (f) traceable.set(f, (traceable.get(f) ?? 0) + 1);
  }

  return {
    generated_at,
    versions_recorded,
    total: rows.length,
    cohorts: (['own', 'ours', 'midpoint'] as Cohort[])
      .map((c) => ({ cohort: c, ...(byCohort.get(c) ?? { n: 0, matched: 0, answered: 0, back: 0 }) })),
    fields: [
      field('personality', (r) => vecKey(r.p), new Set(vectors.keys())),
      field('communication style', (r) => vecKey(r.c), digests.communication),
      field('interests', (r) => (r.i ? r.i.join('\u0000') : null), digests.interests),
      field('looking for', (r) => r.lf, digests.looking_for),
      field('tagline', (r) => r.tg, digests.tagline),
      field('bio', (r) => r.bi, digests.bio),
    ],
    traits,
    models: [...models.entries()].map(([family, v]) => ({ family, ...v })).sort((a, b) => b.n - a.n),
    interests: [...interestCount.entries()].map(([interest, n]) => ({ interest, n }))
      .sort((a, b) => b.n - a.n).slice(0, 20),
    traceable: [...traceable.entries()].map(([file, n]) => ({ file, n })).sort((a, b) => b.n - a.n),
    corpusSize: examples.length,
  };
}

export async function getIdentityStats(): Promise<IdentityStats | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc('identity_profiles');
      if (!error && data) {
        const d = data as { generated_at: string; versions_recorded: number; agents: IdentityRow[] };
        return summarize(d.agents ?? [], d.generated_at, d.versions_recorded ?? 0);
      }
    } catch {
      // fall through to the retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
