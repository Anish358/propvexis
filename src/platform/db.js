import pg from 'pg';
import { config } from './config.js';

// Fallbacks applied when a PG_POOL_* env var is missing, non-numeric, or <= 0.
// Every one of these must stay positive: node-pg treats 0 as "immediately" for
// the timeouts and as "recycle on first use" for maxUses, which would be worse
// than the default it replaces.
export const POOL_DEFAULTS = {
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  maxUses: 7_500,
};

const posOr = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);

// Pure: config -> node-pg Pool options. Exported separately from the pool itself
// so the sizing rules are testable without a database (test/db-pool.test.js).
// See config.js for the per-process sizing budget — this max is multiplied by
// the number of cluster workers, across three envs sharing one PG instance.
export function poolOptions(cfg = config) {
  return {
    connectionString: cfg.databaseUrl,
    max: posOr(cfg.pgPoolMax, POOL_DEFAULTS.max),
    idleTimeoutMillis: posOr(cfg.pgPoolIdleTimeoutMs, POOL_DEFAULTS.idleTimeoutMillis),
    connectionTimeoutMillis: posOr(
      cfg.pgPoolConnectionTimeoutMs,
      POOL_DEFAULTS.connectionTimeoutMillis
    ),
    maxUses: posOr(cfg.pgPoolMaxUses, POOL_DEFAULTS.maxUses),
    // Tags the connection in pg_stat_activity so it's obvious which env is
    // holding connections when three of them share one Postgres instance.
    application_name: `propvexis-${cfg.nodeEnv ?? 'development'}`,
  };
}

export const pool = new pg.Pool(poolOptions());

// An idle client that dies (DB restart, network blip, `pg_terminate_backend`)
// emits 'error' on the pool. With no listener attached Node treats it as an
// unhandled error event and kills the process — so one DB hiccup would take the
// whole API down. Log it and let the pool evict that client instead.
pool.on('error', (err) => {
  console.error(`[db] idle client error (client evicted, pool continues): ${err.message}`);
});

export const query = (text, params) => pool.query(text, params);

/**
 * Run `fn` inside a transaction on one pooled client.
 *
 * Four call sites still hand-roll their own BEGIN/COMMIT/ROLLBACK instead of
 * using this: src/platform/auth/auth.js, src/domain/prop/challenges.js,
 * src/domain/trades/strategies.js, and src/routes/trades.js. Account
 * provisioning (src/domain/accounts/provision.js) is the first caller of this
 * helper — it is for NEW code, plus an eventual migration of those four that
 * nobody has done yet. Do not read the four as migrated; they are not. Two
 * properties are worth stating about the helper itself, because getting either
 * wrong is silent:
 *
 *  - the client is released in `finally`, so a throw anywhere cannot leak it.
 *    A leaked client is invisible until the pool is exhausted, which then looks
 *    like the database being slow rather than like a bug.
 *  - a failing ROLLBACK is swallowed. On a dead connection ROLLBACK throws too,
 *    and letting that propagate would replace the real cause with
 *    "connection terminated" in every log.
 *
 * `connect` is injectable so the contract above is testable without a database
 * (test/db-transaction.test.js) — this repo has no test DB.
 */
export async function withTransaction(fn, connect = () => pool.connect()) {
  const client = await connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* see above — never mask the original error */
    }
    throw err;
  } finally {
    client.release();
  }
}
