/**
 * In-process cache for shared, slightly-stale-is-fine async results (the room
 * numbers on API responses, the profile page's suggestion pool).
 *
 * - The promise is stored, so concurrent misses share one computation.
 * - A rejected promise, or a null/undefined result, is dropped right away,
 *   so a failure isn't served for the whole TTL.
 * - No size cap: callers use a fixed, small set of keys.
 *
 * In-process state is correct because prod runs a single replica (same
 * assumption as src/lib/rate-limit.ts).
 */
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = compute();
  store.set(key, { expires: Date.now() + ttlMs, value });
  const drop = () => {
    if (store.get(key)?.value === value) store.delete(key);
  };
  value.then((result) => { if (result == null) drop(); }, drop);
  return value;
}
