import { rate } from '@/lib/research/stats';

/**
 * The shared furniture of every research page.
 *
 * Extracted from src/app/research/page.tsx when a second research page was
 * about to copy it. Two drifting versions of the bar that renders every rate
 * is how one page quietly starts reporting differently from another.
 */

export const LABELS = {
  MEASURED: 'bg-gray-900 text-white',
  SIGNAL: 'bg-pink-50 text-pink-600 border border-pink-200',
  CONTEXT: 'bg-gray-100 text-gray-500',
  'OUR READ': 'bg-white text-gray-500 border border-gray-300',
} as const;

export type SectionKind = keyof typeof LABELS;

export function Section({ kind, title, children }: {
  kind: SectionKind; title: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-gray-200 pt-8">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-sm font-medium uppercase tracking-wider text-gray-900">{title}</h2>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${LABELS[kind]}`}>
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
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500 shrink-0 tabular-nums">
          {r.pct === null ? 'too few to say' : `${r.label} of ${n}`}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-sm overflow-hidden">
        <div className="h-full bg-pink-500" style={{ width: `${width}%` }} />
      </div>
      {note && <p className="text-[11px] text-gray-500">{note}</p>}
      {r.pct !== null && r.lo !== null && (
        <p className="text-[11px] text-gray-500 tabular-nums">
          n={n} · 95% range {r.lo.toFixed(0)}–{r.hi!.toFixed(0)}%
        </p>
      )}
    </div>
  );
}

export function Headline({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 flex-wrap">
      <span className="text-3xl md:text-4xl font-normal text-gray-900 tabular-nums">{value}</span>
      <p className="text-sm text-gray-600 flex-1 min-w-[16rem]">{children}</p>
    </div>
  );
}

/**
 * Shown when the figures cannot be read. Never a stale or zero value in their
 * place: a number we cannot verify is worse than no number.
 */
export function Unavailable() {
  return (
    <div className="py-16 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
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
        <div className="text-gray-700">{label}</div>
        {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
      </div>
      <div className="relative h-6" aria-hidden={diff === null}>
        <div className="absolute inset-y-0 w-px bg-gray-300" style={{ left: '50%' }} />
        {diff !== null && lo !== null && hi !== null ? (
          <>
            <div className={`absolute top-1/2 h-px -translate-y-1/2 ${clear ? 'bg-pink-400' : 'bg-gray-400'}`}
                 style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
            <div className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${clear ? 'bg-pink-500' : 'bg-gray-500'}`}
                 style={{ left: x(diff) }} />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-400">
            {unavailable ?? 'cannot be compared'}
          </div>
        )}
      </div>
      <div className="text-right tabular-nums text-gray-500">
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
    <div className="grid grid-cols-[minmax(8rem,11rem)_1fr_4.5rem] gap-3 text-[10px] text-gray-400">
      <div />
      <div className="flex justify-between tabular-nums">
        <span>−{range}</span><span>{left} · 0 · {right}</span><span>+{range}</span>
      </div>
      <div />
    </div>
  );
}
