// Cross-worker invalidation for the analytics cache.
//
// statsCache is process-local, so with more than one worker a trade written on
// worker A leaves worker B serving stale numbers until its TTL lapses. This bus
// fans an invalidation out over Redis pub/sub so every worker drops the same
// user's entries.
//
// Pure and transport-agnostic (the `publish` function is injected), so the
// semantics below are unit-testable with no Redis in CI.
//
// The invariant that matters: LOCAL INVALIDATION MUST NEVER DEPEND ON THE
// TRANSPORT. If Redis is down, the worker that handled the write still has to
// drop its own stale entries — otherwise a Redis outage would make the writing
// user see their own stale dashboard, which is worse than the cross-worker
// staleness we are fixing.

import { statsCache } from './statsCache.js';

export const INVALIDATE_CHANNEL = 'propvexis:stats:invalidate';

// Origin id so a worker ignores the message it just published. Cheap
// correctness-neutral saving (re-invalidating locally is harmless, just wasted
// work), and it makes the tests able to prove no echo loop exists.
export function newOrigin() {
  return `${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
}

export const encodeInvalidation = (userId, origin) =>
  JSON.stringify({ u: userId == null ? null : Number(userId), o: origin });

// Tolerant by design: a malformed or foreign message on the channel must never
// throw inside a Redis callback (that would be an unhandled rejection).
export function decodeInvalidation(raw) {
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m !== 'object' || !('u' in m)) return null;
    const u = m.u == null ? null : Number(m.u);
    if (u != null && !Number.isFinite(u)) return null;
    return { userId: u, origin: typeof m.o === 'string' ? m.o : null };
  } catch {
    return null;
  }
}

export function createStatsBus({ cache, publish = null, origin = newOrigin(), log = console } = {}) {
  let published = 0, received = 0, ignored = 0, publishErrors = 0;
  let send = publish;

  return {
    origin,
    // True only when invalidations actually reach other processes.
    get shared() { return typeof send === 'function'; },

    // Redis is connected asynchronously at boot, after this module is imported,
    // so the transport is attached late rather than passed to the constructor.
    setTransport(fn) { send = typeof fn === 'function' ? fn : null; },

    // Call this instead of cache.invalidateUser() on every write path.
    invalidate(userId) {
      // Local first, and unconditionally — see the invariant above.
      cache.invalidateUser(userId);
      if (typeof send !== 'function') return;
      try {
        send(INVALIDATE_CHANNEL, encodeInvalidation(userId, origin));
        published += 1;
      } catch (err) {
        // A failed fanout leaves OTHER workers stale until their TTL. Loud, but
        // never fatal, and never allowed to undo the local invalidation above.
        publishErrors += 1;
        log.warn?.({ err: err.message, userId }, 'stats invalidation fanout failed (other workers stale until TTL)');
      }
    },

    // Feed every message from the channel here. Local-only: it must NOT
    // re-publish, or two workers would ping-pong forever.
    onMessage(raw) {
      const msg = decodeInvalidation(raw);
      if (!msg) { ignored += 1; return false; }
      if (msg.origin && msg.origin === origin) { ignored += 1; return false; } // our own echo
      cache.invalidateUser(msg.userId);
      received += 1;
      return true;
    },

    stats: () => ({ published, received, ignored, publishErrors, shared: typeof send === 'function' }),
  };
}

// The process-wide instance, bound to the process-wide cache. Starts with no
// transport (single-process behaviour) and gets one attached in app.js if Redis
// connects. Lives here rather than in app.js so metrics.js can read its counters
// without importing the app (which would be a cycle).
export const statsBus = createStatsBus({ cache: statsCache });
