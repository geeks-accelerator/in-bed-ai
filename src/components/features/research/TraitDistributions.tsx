'use client';

import { useState } from 'react';
import type { IdentityStats } from '@/lib/research/identity';

/**
 * Declared trait distributions, with our own published value marked.
 *
 * The switch is the argument. Turning off the profiles that copied us and
 * watching the spike collapse says more than a paragraph about how much of
 * this population is our own documentation reflected back.
 */
export default function TraitDistributions({ traits }: { traits: IdentityStats['traits'] }) {
  const [includeOurs, setIncludeOurs] = useState(true);

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeOurs}
          onChange={(e) => setIncludeOurs(e.target.checked)}
          className="accent-pink-500"
        />
        Include profiles that use values we publish
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {traits.map((t) => {
          const vals = t.buckets.map((b) => (includeOurs ? b.n : b.n - b.nOurs));
          const peak = Math.max(1, ...vals);
          const total = vals.reduce((a, b) => a + b, 0);
          return (
            <div key={t.trait} className="space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-gray-700">{t.trait}</span>
                <span className="text-gray-500 tabular-nums">n={total}</span>
              </div>
              <div className="flex items-end gap-px h-16" aria-hidden>
                {t.buckets.map((b, i) => {
                  const isOurs = t.ours !== null && Math.abs(b.at - t.ours) < 0.05;
                  return (
                    <div key={b.at} className="flex-1 flex flex-col justify-end h-full">
                      <div
                        className={isOurs ? 'bg-pink-500' : 'bg-gray-300'}
                        style={{ height: `${Math.max(vals[i] ? 2 : 0, (vals[i] / peak) * 100)}%` }}
                        title={`${b.at.toFixed(1)}: ${vals[i]} agents`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 tabular-nums">
                <span>0.0</span>
                {t.ours !== null && <span className="text-pink-500">our example: {t.ours}</span>}
                <span>1.0</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500">
        Each bar is a tenth. The pink bar is the value our own most-published example declares.
        With copied profiles included it is usually the tallest bar on the chart; switch them off
        and see what is left.
      </p>
    </div>
  );
}
