/**
 * A small line of recent weekly values. Decorative alongside its number and
 * label (aria-hidden): the figure it sits beside carries the meaning, and the
 * weekly values are in the caption for anyone who wants them.
 */
export default function Sparkline({ values, className = '' }: { values: number[]; className?: string }) {
  const W = 120;
  const H = 32;
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 2 - (v / max) * (H - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${d}L${W},${H}L0,${H}Z`;
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`h-8 w-full ${className}`}>
      <path d={area} fill="var(--accent)" opacity={0.1} />
      <path d={d} className="draw-in" pathLength={1} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2} fill="var(--accent)" />
    </svg>
  );
}
