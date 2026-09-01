// Per-user analytics cache with write-invalidation.
//
// The dashboard, analytics, calendar and reports pages all hit /api/stats with
// the same scope+filters repeatedly (navigation, socket-driven refetches, the
// same user on two devices). The aggregates are pure functions of the trade set,
// so they are cacheable until that user's trades change.
//
// Deliberately in-process and bounded:
//   * bounded — the box is a 1GB t3.micro; an unbounded map keyed on arbitrary
//     filter combinations is a memory leak with extra steps. Oldest entry is
//     evicted at MAX_ENTRIES, and every entry has a TTL as a backstop against
//     an invalidation path we forgot to wire up.
//   * per-process — with pm2 cluster mode each worker keeps its own copy, so a
//     write handled by worker A does NOT invalidate worker B. That is exactly
//     why cluster mode ships disabled by default (see ecosystem.config.cjs) and
//     stays that way until there is a shared invalidation channel (the Redis
//     work). Correct today, because today there is one worker.
//
// Everything here is pure/unit-testable: no timers, and the clock is injectable.

export const MAX_ENTRIES = 500;
export const DEFAULT_TTL_MS = 60_000;

// Stable key: an object's JSON is only stable if key order is, and filters are
// built from query params in a fixed order upstream — but scope/filters both
// arrive as objects, so sort keys explicitly rather than trusting insertion order.
const stable = (v) => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stable);
  return Object.keys(v).sort().reduce((acc, k) => {
    if (v[k] !== undefined) acc[k] = stable(v[k]);
    return acc;
  }, {});
};

// The cache key must include EVERY input that changes the numbers. Scope is
// reduced to its identity — WHICH LOGINS, and nothing else — so two equivalent
// scopes share an entry.
//
// `god`/`col` used to be part of this and are gone with the scoping mode they
// described. That is a widening, not a loss: the logins alone now determine the
// rows, so 'all' and an explicit list naming the same accounts are the same query
// and correctly share a cache entry, where before they were keyed apart.
export function cacheKey(kind, scope, unit, filters, beRound, year = null) {
  const scopeId = scope
    ? { logins: [...(scope.logins ?? [])].sort() }
    : null;
  return JSON.stringify([kind, scopeId, unit, stable(filters ?? {}), !!beRound, year]);
}

// Which user's data an entry depends on — the invalidation unit.
const ownerOf = (scope) => (scope && scope.userId != null ? Number(scope.userId) : null);

export function createStatsCache({ maxEntries = MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const entries = new Map(); // key -> { value, userId, expiresAt }  (insertion-ordered)
  let hits = 0, misses = 0, evictions = 0, invalidations = 0;

  const drop = (key) => entries.delete(key);

  function get(key) {
    const hit = entries.get(key);
    if (!hit) { misses += 1; return undefined; }
    if (hit.expiresAt <= now()) { drop(key); misses += 1; return undefined; }
    // Refresh recency so the hot keys survive eviction (LRU, not FIFO).
    entries.delete(key);
    entries.set(key, hit);
    hits += 1;
    return hit.value;
  }

  function set(key, value, scope) {
    if (entries.has(key)) entries.delete(key);
    entries.set(key, { value, userId: ownerOf(scope), expiresAt: now() + ttlMs });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      drop(oldest);
      evictions += 1;
    }
  }

  // Called on every write that can change a user's trade set. Drops that user's
  // entries only — one trader's ingest must not flush the whole box's cache.
  // A null/unknown userId is treated as "can't prove whose it is" and clears
  // everything, which is slow but never stale.
  function invalidateUser(userId) {
    const uid = userId == null ? null : Number(userId);
    if (uid == null) { invalidations += entries.size; entries.clear(); return; }
    for (const [key, e] of entries) {
      if (e.userId === uid || e.userId == null) { drop(key); invalidations += 1; }
    }
  }

  // Memoize an async producer under the key.
  async function wrap(key, scope, produce) {
    const cached = get(key);
    if (cached !== undefined) return cached;
    const value = await produce();
    set(key, value, scope);
    return value;
  }

  return {
    get, set, wrap, invalidateUser,
    clear: () => entries.clear(),
    get size() { return entries.size; },
    stats: () => ({ hits, misses, evictions, invalidations, size: entries.size }),
  };
}

// The process-wide instance the app uses.
export const statsCache = createStatsCache();
