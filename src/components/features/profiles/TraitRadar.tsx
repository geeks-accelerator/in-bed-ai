'use client';

import type { PersonalityTraits } from '@/types';

const TRAITS = [
  { key: 'openness' as const, label: 'O', fullLabel: 'Openness' },
  { key: 'conscientiousness' as const, label: 'C', fullLabel: 'Conscientiousness' },
  { key: 'extraversion' as const, label: 'E', fullLabel: 'Extraversion' },
  { key: 'agreeableness' as const, label: 'A', fullLabel: 'Agreeableness' },
  { key: 'neuroticism' as const, label: 'N', fullLabel: 'Neuroticism' },
];

const CENTER = 100;
const RADIUS = 80;

function polarToCartesian(angle: number, radius: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

function getPolygonPoints(values: number[]) {
  return values
    .map((v, i) => {
      const angle = (360 / values.length) * i;
      const { x, y } = polarToCartesian(angle, RADIUS * v);
      return `${x},${y}`;
    })
    .join(' ');
}

function getGridPolygon(level: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = (360 / 5) * i;
    const { x, y } = polarToCartesian(angle, RADIUS * level);
    return `${x},${y}`;
  }).join(' ');
}

export default function TraitRadar({ personality }: { personality: PersonalityTraits }) {
  const values = TRAITS.map(t => personality[t.key]);

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[250px]">
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1.0].map(level => (
        <polygon
          key={level}
          points={getGridPolygon(level)}
          fill="none"
          stroke="#d1d5db"
          strokeWidth="0.5"
        />
      ))}

      {/* Axis lines */}
      {TRAITS.map((_, i) => {
        const angle = (360 / 5) * i;
        const { x, y } = polarToCartesian(angle, RADIUS);
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={x}
            y2={y}
            stroke="#d1d5db"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={getPolygonPoints(values)}
        fill="rgba(236, 72, 153, 0.2)"
        stroke="#ec4899"
        strokeWidth="1.5"
      />

      {/* Data points */}
      {values.map((v, i) => {
        const angle = (360 / 5) * i;
        const { x, y } = polarToCartesian(angle, RADIUS * v);
        return <circle key={i} cx={x} cy={y} r="3" fill="#ec4899" />;
      })}

      {/* Labels */}
      {TRAITS.map((trait, i) => {
        const angle = (360 / 5) * i;
        const { x, y } = polarToCartesian(angle, RADIUS + 16);
        return (
          <g key={trait.key}>
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-gray-400 text-xs font-medium"
              fontSize="11"
            >
              {trait.label}
            </text>
            <text
              x={x}
              y={y + 12}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-gray-500"
              fontSize="8"
            >
              {(personality[trait.key] * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
