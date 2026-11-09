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
