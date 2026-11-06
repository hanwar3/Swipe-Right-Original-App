/**
 * A small in-process cache for public data that changes rarely (the card
 * catalogue, the credit catalogue). Every instance keeps its own copy for a
 * short time, so a burst of thousands of app opens costs one database read per
 * instance per minute instead of one per open.
 *
 * Concurrent misses share one load (no stampede when the entry expires).
 * Never use this for per-user or secret data.
 */

interface Entry<T> {
  value?: T;
  expires: number;
  loading?: Promise<T>;
}

const entries = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key) as Entry<T> | undefined;
  if (hit && hit.value !== undefined && hit.expires > now) return hit.value;
  if (hit?.loading) return hit.loading;

  const loading = load().then(
    (value) => {
      entries.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
    (err) => {
      entries.delete(key);
      throw err;
    }
  );
  entries.set(key, { value: hit?.value, expires: hit?.expires ?? 0, loading });
  return loading;
}

/** Drop an entry now, e.g. after an editorial update on this instance. */
export function invalidate(key: string): void {
  entries.delete(key);
}
