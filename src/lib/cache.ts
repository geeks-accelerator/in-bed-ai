/**
 * In-process cache for shared, slightly-stale-is-fine async results (the room
 * numbers on API responses, the profile page's suggestion pool, the research
 * reads).
 *
 * - The promise is stored, so concurrent misses share one computation.
 * - A rejected promise, or a null/undefined result, is never kept, so a
 *   failure isn't served for the whole TTL and the next request retries.
 * - With `staleMs`, an entry past its TTL is still returned, at once, for that
 *   long, while one background refresh replaces it. A refresh that fails
 *   keeps the last good value. Past `ttlMs + staleMs` the caller waits for a
 *   fresh read, so an outage surfaces as a failed read instead of hiding
 *   behind an old one indefinitely. Without `staleMs`, expiry means waiting.
 * - No size cap: callers use a fixed, small set of keys.
 *
 * In-process state is correct because prod runs a single replica (same
 * assumption as src/lib/rate-limit.ts).
 */
type Entry = {
  value: Promise<unknown>;
  // When the value was computed. Undefined while the first computation runs.
  at?: number;
  refreshing?: Promise<unknown>;
};

const store = new Map<string, Entry>();

export function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
  { staleMs = 0 }: { staleMs?: number } = {},
): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();

  if (hit) {
    // First computation still running: share it.
    if (hit.at === undefined) return hit.value as Promise<T>;
    const age = now - hit.at;
    if (age < ttlMs) return hit.value as Promise<T>;
    if (age < ttlMs + staleMs) {
      if (!hit.refreshing) refresh(key, hit, compute);
      return hit.value as Promise<T>;
    }
  }

  // Nothing usable: compute, and make every caller wait for it.
  const value = compute();
  const entry: Entry = { value };
  store.set(key, entry);
  value.then(
    (result) => {
      if (store.get(key) !== entry) return;
      if (result == null) store.delete(key);
      else entry.at = Date.now();
    },
    () => { if (store.get(key) === entry) store.delete(key); },
  );
  return value;
}

function refresh<T>(key: string, entry: Entry, compute: () => Promise<T>) {
  const next = compute();
  entry.refreshing = next;
  const done = () => { if (entry.refreshing === next) entry.refreshing = undefined; };
  next.then(
    (result) => {
      done();
      if (result == null || store.get(key) !== entry) return;
      entry.value = next;
      entry.at = Date.now();
    },
    done,
  );
}

/** Tests only: forget everything. */
export function clearCache() {
  store.clear();
}
