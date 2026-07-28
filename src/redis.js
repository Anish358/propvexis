// Optional Redis, used for the two pieces of cross-process state that block
// running more than one backend worker (see src/cluster.js):
//   1. the Socket.IO adapter, so a broadcast reaches clients on every worker
//   2. the analytics-cache invalidation bus (src/statsBus.js)
//
// Gated exactly like Sentry/Razorpay/metrics in this codebase: with REDIS_URL
// unset this module is inert and the app behaves precisely as it did before —
// in-memory adapter, process-local cache. That keeps local dev and CI free of an
// extra service, and means a fresh deploy with no config can't break.
//
// Availability rules that matter here:
//   * A FAILED CONNECT MUST NOT STOP THE APP. Degrading to single-process
//     behaviour is strictly better than not booting, so connect() failures are
//     logged and swallowed.
//   * node-redis emits 'error' on the client. Unhandled, that is an unhandled
//     error event and the process dies — the same trap the pg pool had. Both
//     clients get listeners before anything else happens.
import { createClient } from 'redis';
import { config } from './config.js';

// Live status, read by /metrics. `connected` is the honest signal for "is
// cross-worker state actually working right now" — Redis can drop long after a
// successful boot, and the Socket.IO adapter goes quietly one-way when it does.
export const redisStatus = {
  configured: false,
  connected: false,
  lastError: null,
};

export const redisEnabled = () => !!config.redisUrl;

// How long to wait for the initial connect before giving up and running
// single-process. Short on purpose: boot latency is user-visible via the deploy's
// health check, and the fallback is safe.
export const CONNECT_TIMEOUT_MS = 3_000;

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref()),
  ]);

// Pub/sub needs two connections: a client in subscriber mode cannot issue other
// commands, and the Socket.IO adapter requires the pair too.
export async function createRedisPair(log = console) {
  if (!redisEnabled()) return null;
  redisStatus.configured = true;

  const pub = createClient({ url: config.redisUrl });
  const sub = pub.duplicate();

  // Attach BEFORE connecting, or an immediate failure is an unhandled 'error'.
  for (const [name, client] of [['pub', pub], ['sub', sub]]) {
    client.on('error', (err) => {
      redisStatus.connected = false;
      redisStatus.lastError = err.message;
      // node-redis retries on its own; log at warn so a blip is not paged as fatal.
      log.warn?.({ err: err.message, client: name }, 'redis error (will retry; running degraded)');
    });
    client.on('ready', () => { redisStatus.connected = true; redisStatus.lastError = null; });
    client.on('end', () => { redisStatus.connected = false; });
  }

  try {
    await withTimeout(Promise.all([pub.connect(), sub.connect()]), CONNECT_TIMEOUT_MS, 'redis connect');
    redisStatus.connected = true;
    log.info?.('redis connected — shared socket adapter + cache invalidation enabled');
    return { pub, sub };
  } catch (err) {
    redisStatus.connected = false;
    redisStatus.lastError = err.message;
    log.error?.(
      { err: err.message },
      'redis unavailable — continuing WITHOUT shared socket adapter or cache invalidation. ' +
      'Safe with a single worker; do NOT run multiple workers in this state.'
    );
    // Stop the clients retrying forever in the background for a boot we already
    // gave up on; a deploy/restart is what recovers this.
    await Promise.allSettled([pub.destroy?.(), sub.destroy?.()]);
    return null;
  }
}
