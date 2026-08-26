import cacheConstants from "../shared/cache.constants";
import type { cache } from "../shared/shared.plugin";

/**
 * Read-through cache for coach store reads (change: coach-reports-store).
 *
 * Keys fold in the dataset version — `coach:v<version>:<shape>:<scope>` — so a
 * publish that bumps `coach_dataset_meta.version` orphans every previous key at
 * once. That matters because the Redis client exposes get/set/delete but no
 * `scan`/`keys`, so there is no way to sweep a namespace; versioning is what
 * makes invalidation possible without one. Orphaned keys expire on their TTL.
 *
 * Outage rule (single rule, per the design): when the store is unreachable but
 * a cached value exists, serve it (last-good). When the cache is cold AND the
 * store is unreachable, fail loud — never serve an empty portal, and never fall
 * through to the compiled-in bundle, which is a migration-gate fallback only.
 */

const TTL = "10m";

export function coachCacheKey(
  version: string,
  shape: string,
  scope = "all",
): string {
  return cacheConstants.coachStore(version, shape, scope);
}

export interface CoachCacheDeps {
  cache: cache;
  /** Current dataset version; reads that miss the meta row skip caching. */
  version: () => Promise<string | null>;
}

/**
 * Run `load` behind the cache. On a store failure, fall back to the last cached
 * value when one exists; otherwise rethrow so the caller fails loud.
 */
export async function cachedRead<T extends object>(
  deps: CoachCacheDeps,
  shape: string,
  scope: string,
  load: () => Promise<T>,
): Promise<T> {
  let version: string | null = null;
  try {
    version = await deps.version();
  } catch {
    version = null;
  }

  // No version → no coherent key; read straight through rather than cache
  // something we cannot invalidate.
  if (!version) return load();

  const key = coachCacheKey(version, shape, scope);
  const hit = await deps.cache.get<T>(key).catch(() => null);
  if (hit !== null && hit !== undefined) return hit;

  try {
    const value = await load();
    await deps.cache.set(key, value, TTL).catch(() => undefined);
    return value;
  } catch (err) {
    // Store unreachable: serve last-good if we have it, else fail loud.
    const lastGood = await deps.cache
      .get<T>(coachCacheKey(version, shape, scope))
      .catch(() => null);
    if (lastGood !== null && lastGood !== undefined) return lastGood;
    throw err;
  }
}
