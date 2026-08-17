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
