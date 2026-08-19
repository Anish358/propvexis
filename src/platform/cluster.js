// Cluster-mode safety.
//
// Running more than one worker is the fix for "single Node process, one core"
// (failure point #3 for the >=1000-user bar). But this app holds TWO pieces of
// per-process state that multiple workers would silently break:
//
//   1. Socket.IO's default in-memory adapter. Broadcasts only reach clients
//      connected to the SAME worker, and the HTTP long-polling handshake needs
//      sticky sessions, which pm2's cluster mode does not provide. Symptom:
//      trades that appear for one browser and not another, plus intermittent
//      "Session ID unknown" errors.
//   2. The analytics cache (statsCache.js). Invalidation is a local Map delete,
//      so a trade written on worker A leaves worker B serving stale numbers
//      until its TTL lapses.
//
// A third piece of per-process state exists but is deliberately NOT a blocking
// reason below: the session-epoch cache in platform/auth/auth.js. Its staleness
// is bounded by a 60s TTL, so after a password reset the revocation is exact on
// the worker that handled it and lands within a minute everywhere else — a
// bounded delay, not the silent unbounded wrongness the two items above cause.
// (Open sockets are not affected: disconnectSockets goes through the Redis
// adapter, so it already reaches every worker.) Closing that last minute means
// putting epoch invalidation on the statsBus channel; worth doing before
// raising `instances`, but it does not make cluster mode incorrect.
//
// Both of the items above are fixed by the same piece of work — a shared Redis-backed adapter and
// invalidation channel. Until then `instances` stays 1 in ecosystem.config.cjs,
// and this module makes the constraint enforceable rather than tribal knowledge:
// the app checks at boot and complains loudly if it finds itself clustered
// without the shared state it needs.
import cluster from 'node:cluster';

// pm2 cluster mode runs the app under Node's cluster module and gives each
// worker a NODE_APP_INSTANCE index. Fork mode does neither.
export function isClustered(env = process.env) {
  return cluster.isWorker === true || env.NODE_APP_INSTANCE != null;
}

// Pure: given what shared state exists, is running multiple workers safe?
// Returns the specific reasons it is not, so the boot log is actionable.
export function clusterSafety({ clustered, hasSharedSocketAdapter, hasSharedStatsCache }) {
  if (!clustered) return { safe: true, reasons: [] };
  const reasons = [];
  if (!hasSharedSocketAdapter) {
    reasons.push(
      'socket.io is using the in-memory adapter: realtime events will not reach clients ' +
      'on other workers, and polling handshakes need sticky sessions'
    );
  }
  if (!hasSharedStatsCache) {
    reasons.push(
      'the analytics cache is per-process: a trade written on one worker will not ' +
      'invalidate the others, so /api/stats can serve stale numbers'
    );
  }
  return { safe: reasons.length === 0, reasons };
}

// Advisory pool ceiling: total connections are workers x per-process max, and
// prod/staging/dev share one Postgres. Returns the per-process max that keeps
// the whole box inside `serverMax`, given how many envs and workers there are.
export function advisePoolMax({ workers, envs = 3, serverMax = 100, reserved = 3 }) {
  const budget = Math.max(1, serverMax - reserved);
  return Math.max(1, Math.floor(budget / Math.max(1, envs) / Math.max(1, workers)));
}
