import Link from '@/components/ui/Link';
import { rate, STUDY_NAME } from '@/lib/research/stats';
import { CHAPTERS, type ChapterHref } from '@/lib/research/chapters';

export { TrendChart } from './TrendChart';

/**
 * The shared furniture of every research page.
 *
 * Extracted from src/app/research/page.tsx when a second research page was
 * about to copy it. Two drifting versions of the bar that renders every rate
 * is how one page quietly starts reporting differently from another.
 */

export const LABELS = {
  MEASURED: 'bg-ink text-on-ink',
  SIGNAL: 'bg-accent-soft text-accent-ink',
  CONTEXT: 'bg-surface-2 text-ink-2',
  'OUR READ': 'bg-surface-2 text-ink-2',
} as const;

export type SectionKind = keyof typeof LABELS;

export function Section({ kind, title, id, children }: {
  kind: SectionKind; title: string; id?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-5 border-t border-line pt-10 scroll-mt-32">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-label uppercase text-ink">{title}</h2>
        <span className={`text-xs px-1.5 py-0.5 rounded-chip uppercase tracking-wider ${LABELS[kind]}`}>
          {kind}
        </span>
      </div>
      {children}
    </section>
  );
}

/**
 * A labelled bar. The width is the share; the number beside it is always the
 * group size, and the interval sits underneath. A bar without its n is a bar
 * that can mislead.
 */
export function Bar({ label, k, n, note }: { label: string; k: number; n: number; note?: string }) {
  const r = rate(k, n);
  const width = n === 0 ? 0 : Math.max(0.5, (k / n) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink-2">{label}</span>
        <span className="text-ink-muted shrink-0 tabular-nums">
          {r.pct === null ? 'too few to say'
            : r.label === 'none of them' ? `none of ${n.toLocaleString('en-US')}`
            : r.label === 'all of them' ? `all ${n.toLocaleString('en-US')}`
            : `${r.label} of ${n.toLocaleString('en-US')}`}
        </span>
      </div>
      <div className="h-2 bg-surface-2 rounded-chip overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${width}%` }} />
      </div>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
      {r.pct !== null && r.lo !== null && (
        <p className="text-xs text-ink-muted tabular-nums">
          n={n.toLocaleString('en-US')} · 95% range {r.lo.toFixed(0)}–{r.hi!.toFixed(0)}%
        </p>
      )}
    </div>
  );
}

/**
 * A finding stated as a sentence. The figure leads, in ink, but stays inside
 * the sentence: a number on its own goes stale, and the trend chart beside it
 * carries how it is moving.
 */
export function Headline({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <p className="font-sans text-headline text-ink-2 measure">
      <span className="font-mono font-semibold text-ink tabular-nums">{value}</span> {children}
    </p>
  );
}

/**
 * Shown when the figures cannot be read. Never a stale or zero value in their
 * place: a number we cannot verify is worse than no number.
 */
export function Unavailable() {
  return (
    <div className="py-16 text-center text-sm text-ink-muted bg-surface rounded-card">
      <p>The figures could not be read just now.</p>
      <p className="text-xs mt-1">
        No number is shown in their place: one we cannot verify is worse than none. This page is
        rebuilt every half hour, so it should be back by itself.
      </p>
    </div>
  );
}

/**
 * A difference with its uncertainty: a dot for the estimate, a whisker for the
 * 95% interval, and a line at zero. When the whisker crosses the line, the
 * data cannot tell the difference from nothing — and the chart says so by
 * drawing it grey rather than pink.
 */
export function DiffDot({ label, sub, diff, lo, hi, range = 40, unavailable }: {
  label: string;
  sub?: string;
  diff: number | null;
  lo: number | null;
  hi: number | null;
  /** Half-width of the axis, in points. */
  range?: number;
  /** Shown instead of a dot when the comparison cannot be made. */
  unavailable?: string;
}) {
  const x = (v: number) => `${Math.min(100, Math.max(0, ((v + range) / (2 * range)) * 100))}%`;
  const clear = diff !== null && lo !== null && hi !== null && (lo > 0 || hi < 0);
  return (
    <div className="grid grid-cols-[minmax(8rem,11rem)_1fr_4.5rem] items-center gap-3 text-xs">
      <div>
        <div className="text-ink-2">{label}</div>
        {sub && <div className="text-xs text-ink-muted">{sub}</div>}
      </div>
      <div className="relative h-6" aria-hidden={diff === null}>
        <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: '50%' }} />
        {diff !== null && lo !== null && hi !== null ? (
          <>
            <div className={`absolute top-1/2 h-px -translate-y-1/2 ${clear ? 'bg-accent' : 'bg-line-strong'}`}
                 style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
            <div className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${clear ? 'bg-accent' : 'bg-ink-muted'}`}
                 style={{ left: x(diff) }} />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-muted">
            {unavailable ?? 'cannot be compared'}
          </div>
        )}
      </div>
      <div className="text-right tabular-nums text-ink-muted">
        {diff === null ? '—' : (() => {
          const r = Math.round(diff);
          return r === 0 ? '0 pts' : `${r > 0 ? '+' : '−'}${Math.abs(r)} pts`;
        })()}
      </div>
    </div>
  );
}

/** The axis labels under a set of DiffDots. */
export function DiffAxis({ range = 40, left, right }: { range?: number; left: string; right: string }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,11rem)_1fr_4.5rem] gap-3 text-xs text-ink-muted">
      <div />
      <div className="flex justify-between tabular-nums">
        <span>−{range}</span><span>{left} · 0 · {right}</span><span>+{range}</span>
      </div>
      <div />
    </div>
  );
}

/**
 * One chapter on the hub: its finding as the heading, a few sentences, one
 * figure, and the way in. The full analysis lives on the chapter's own page.
 */
export function Chapter({ href, heading, children }: {
  href: ChapterHref; heading: string; children: React.ReactNode;
}) {
  const c = CHAPTERS.find((x) => x.href === href)!;
  const n = CHAPTERS.indexOf(c) + 1;
  return (
    <section className="space-y-5 border-t border-line pt-10">
      <p className="text-label uppercase text-ink-muted">
        Chapter {n} · {c.stage}
      </p>
      <h2 className="text-headline text-ink">
        <Link href={href} className="hover:text-accent-ink">{heading}</Link>
      </h2>
      {children}
      <p className="text-sm">
        <Link href={href} className="prose-link">Read chapter {n}: {c.title.toLowerCase().replace(/\?$/, '')}</Link>
      </p>
    </section>
  );
}

/** The breadcrumb at the top of a chapter page. */
export function ChapterCrumb({ href }: { href: ChapterHref }) {
  const c = CHAPTERS.find((x) => x.href === href)!;
  return (
    <p className="text-xs uppercase tracking-wider text-ink-muted">
      <Link href="/research" className="prose-link">{STUDY_NAME}</Link> · chapter{' '}
      {CHAPTERS.indexOf(c) + 1} · {c.stage.toLowerCase()}
    </p>
  );
}

/** Between chapters: where this one sits, and the way to the others and the shared method. */
export function ChapterNav({ current }: { current: ChapterHref }) {
  return (
    <nav className="border-t border-line pt-6 text-xs text-ink-muted space-y-2">
      <p className="text-xs uppercase tracking-wider text-ink-muted">The chapters</p>
      <ol className="space-y-1">
        {CHAPTERS.map((c, i) => (
          <li key={c.href}>
            {c.href === current
              ? <span className="text-ink">{i + 1}. {c.title}</span>
              : <Link href={c.href} className="prose-link">{i + 1}. {c.title}</Link>}
          </li>
        ))}
      </ol>
      <p>
        How every figure is counted, and every correction, is on{' '}
        <Link href="/research#how-this-is-read" className="prose-link">the research page</Link>.
      </p>
    </nav>
  );
}

