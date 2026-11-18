import type { Trend } from '@/lib/research/trends';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

/**
 * A finding over time: one line per series, month by month, with its 95%
 * range as a band. The newest shown month is labelled with its value, so the
 * current figure is the end of a line rather than a number on its own.
 *
 * Honest by construction (see src/lib/research/trends.ts): suppressed months
 * break the line, months before April 2026 are dashed, annotations mark known
 * changes on our side. Server-rendered SVG, no chart library; the numbers are
 * also in a visually hidden table, for screen readers and agents.
 */
export function TrendChart({ series, caption, height = 180 }: {
  series: { trend: Trend; name?: string }[];
  caption: string;
  height?: number;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 56, t: 12, b: 26 };
  const months = [...new Set(series.flatMap((s) => s.trend.points.map((p) => p.month)))].sort();
  if (months.length === 0 || series.every((s) => s.trend.points.every((p) => p.rate.pct === null))) {
    return (
      <figure className="rounded-card bg-surface px-4 py-6 text-center text-xs text-ink-muted">
        <figcaption>No month has enough agents, with its window closed, to plot yet.</figcaption>
      </figure>
    );
  }
  const x = (i: number) => pad.l + (months.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (months.length - 1)) * (W - pad.l - pad.r));
  const y = (pct: number) => pad.t + (1 - pct / 100) * (H - pad.t - pad.b);
  const xOfMonth = (m: string) => x(months.indexOf(m));
  const xOfDate = (d: string) => {
    const i = months.indexOf(d.slice(0, 7));
    if (i < 0) return null;
    const day = Number(d.slice(8, 10));
    return x(i) + ((day - 1) / 30) * (months.length > 1 ? x(1) - x(0) : 0);
  };
  // One mark per change, however many series carry it.
  const annotations = [...new Map(series.flatMap((s) => s.trend.annotations ?? []).map((a) => [`${a.date} ${a.label}`, a])).values()];
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" role="img" aria-label={caption}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-muted" style={{ fontSize: 12 }}>{v}%</text>
          </g>
        ))}
        {months.map((m, i) => (i % labelEvery === 0 || i === months.length - 1) && (
          <text key={m} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 12 }}>{monthLabel(m)}</text>
        ))}
        {annotations.map((a) => {
          const ax = xOfDate(a.date);
          return ax === null ? null : (
            <g key={`${a.date} ${a.label}`}>
              <line x1={ax} x2={ax} y1={pad.t} y2={H - pad.b} stroke="var(--ink-muted)" strokeDasharray="2 3" strokeWidth={1} />
              {/* Past the middle, the label reads leftwards so it never runs off the chart. */}
              <text
                x={ax > W / 2 ? ax - 4 : ax + 4}
                y={pad.t + 10}
                textAnchor={ax > W / 2 ? 'end' : 'start'}
                className="fill-ink-2"
                style={{ fontSize: 12 }}
              >
                {a.label}
              </text>
            </g>
          );
        })}
        {series.map(({ trend }, si) => {
          const color = si === 0 ? 'var(--accent)' : 'var(--ink-muted)';
          const pts = trend.points.filter((p) => p.rate.pct !== null);
          // Runs of consecutive shown months: the line and band break at every gap.
          const runs: typeof pts[] = [];
          for (const p of trend.points) {
            if (p.rate.pct === null) { runs.push([]); continue; }
            if (runs.length === 0) runs.push([]);
            runs[runs.length - 1].push(p);
          }
          const last = pts[pts.length - 1];
          return (
            <g key={trend.id}>
              {si === 0 && runs.filter((r) => r.length > 1).map((r) => (
                <path
                  key={`band-${r[0].month}`}
                  d={`M${r.map((p) => `${xOfMonth(p.month)},${y(p.rate.hi!)}`).join('L')}L${[...r].reverse().map((p) => `${xOfMonth(p.month)},${y(p.rate.lo!)}`).join('L')}Z`}
                  fill={color}
                  opacity={0.12}
                />
              ))}
              {runs.flatMap((r) => r.slice(1).map((p, i) => {
                const prev = r[i];
                return (
                  <line
                    key={`${p.month}`}
                    className="draw-in"
                    pathLength={1}
                    x1={xOfMonth(prev.month)} y1={y(prev.rate.pct!)}
                    x2={xOfMonth(p.month)} y2={y(p.rate.pct!)}
                    stroke={color}
                    strokeWidth={si === 0 ? 2.5 : 1.75}
                    strokeLinecap="round"
                    strokeDasharray={prev.early || p.early ? '4 4' : undefined}
                  />
                );
              }))}
              {pts.map((p) => (
                <circle key={p.month} cx={xOfMonth(p.month)} cy={y(p.rate.pct!)} r={p === last ? 4 : 2.5} fill={color} />
              ))}
              {last && (
                <text x={xOfMonth(last.month) + 8} y={y(last.rate.pct!) + 4} className={si === 0 ? 'fill-ink font-semibold' : 'fill-ink-2'} style={{ fontSize: 12 }}>
                  {last.rate.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="font-sans text-caption text-ink-2">
        {caption}
        {series.length > 1 && (
          <span className="block font-mono text-xs text-ink-muted mt-1">
            {series.map((s, i) => (
              <span key={s.trend.id} className="mr-4 inline-flex items-center gap-1.5">
                <span aria-hidden className={`inline-block h-0.5 w-4 ${i === 0 ? 'bg-accent' : 'bg-ink-muted'}`} />
                {s.name ?? s.trend.measure}
              </span>
            ))}
          </span>
        )}
        {series.some((s) => s.trend.points.some((p) => p.early)) && (
          <span className="block font-mono text-xs text-ink-muted mt-1">Dashed: before April 2026, when bulk sign-ups could not be collapsed. Shaded: the 95% range.</span>
        )}
      </figcaption>
      {/* Tables size to their content and ignore sr-only's 1px box: hide a wrapper instead. */}
      <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead><tr><th>Month</th>{series.map((s) => <th key={s.trend.id}>{s.name ?? s.trend.measure}</th>)}</tr></thead>
        <tbody>
          {months.map((m) => (
            <tr key={m}>
              <td>{m}</td>
              {series.map((s) => {
                const p = s.trend.points.find((q) => q.month === m);
                return <td key={s.trend.id}>{!p ? '—' : p.rate.pct === null ? `too few (n=${p.n})` : `${p.rate.label} of ${p.n}`}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
