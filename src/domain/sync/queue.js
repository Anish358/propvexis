import { query } from '../../platform/db.js';

// The sync queue: which account gets a server-side terminal next, and what
// happens when that goes wrong.
//
// Split the way statsSql.js is split — the SQL lives in exported *builders* that
// return { text, values }, and the thin async wrappers below just run them. That
// keeps every query assertable in CI without a database, which is the only
// reason the parameterization here is testable at all.

// A journal is a historical record, not a trading signal, so "recent" is minutes
// rather than seconds. 15 minutes in market hours reads as near-live to a trader
// checking mid-session while keeping one serial worker far inside its capacity.
export const SYNC_INTERVAL_MS = 15 * 60 * 1000;

// How long a lease is good for. Generous relative to a normal sync (~90s) because
// the cost of expiring a live lease is a duplicated run, while the cost of too
// short a lease is two terminals fighting over one account.
export const LEASE_MS = 10 * 60 * 1000;

// Escalating backoff. A broker server rejecting a login is usually transient
// (maintenance windows, weekend server rebuilds), so retry — but stop, because a
// wrong password retried forever is how an account gets locked out at the broker.
export const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 60 * 60_000];
export const MAX_ATTEMPTS = 5;

// The same ladder in seconds, because make_interval takes seconds and the SQL
// indexes this array directly. Derived, never hand-written, so the two cannot
// drift apart.
export const BACKOFF_SECS = BACKOFF_MS.map((ms) => Math.round(ms / 1000));

/** When a job that just failed on attempt `attempts` may run again. */
export function nextRunAfter(attempts, now = Date.now()) {
  const idx = Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1;
  return new Date(now + BACKOFF_MS[idx]);
}

/**
 * Is the forex week open? Closed Friday 21:00 UTC through Sunday 21:00 UTC.
 *
 * This exists to stop the scheduler burning ~200 pointless syncs per account per
 * weekend against a server with nothing new to say. A manual "Sync now" is NOT
 * gated on it — a trader reconciling on a Saturday should still get their data.
 */
export function isMarketOpen(at = new Date()) {
  const d = at.getUTCDay();
  const h = at.getUTCHours();
  if (d === 6) return false;                 // Saturday
  if (d === 5 && h >= 21) return false;      // Friday evening
  if (d === 0 && h < 21) return false;       // Sunday before the open
  return true;
}

// ---------------------------------------------------------------------------
// Query builders (pure)
// ---------------------------------------------------------------------------

/**
 * Queue one job. ON CONFLICT targets the partial unique index, so a second
 * request while a job is already queued or leased inserts nothing and returns no
 * row — the caller reports "already queued" rather than building a backlog.
 */
export function enqueueQuery(accountId, reason = 'manual') {
  return {
    text: `INSERT INTO sync_jobs (account_id, reason)
           VALUES ($1, $2)
           ON CONFLICT (account_id) WHERE status IN ('queued', 'leased') DO NOTHING
           RETURNING id, account_id, status, reason, run_after;`,
    values: [accountId, reason],
  };
}

/**
 * Queue every account that is due. One statement rather than select-then-insert:
 * with more than one API worker, the read and the write would race and both
 * would queue the same account.
 *
 * Excluded: inactive accounts, manual (non-MT5) accounts, and credentials whose
 * last login reported trade_allowed — those are master passwords awaiting
 * deletion, and we do not log in with them again.
 */
export function dueAccountsQuery(intervalMs = SYNC_INTERVAL_MS) {
  return {
    text: `INSERT INTO sync_jobs (account_id, reason)
           SELECT a.id,
                  CASE WHEN c.verified_at IS NULL THEN 'first_sync' ELSE 'schedule' END
             FROM mt5_accounts a
             JOIN mt5_credentials c ON c.account_id = a.id
            WHERE a.is_active
              AND a.kind = 'synced'
              AND c.read_only IS NOT FALSE
              AND NOT EXISTS (
                    SELECT 1 FROM sync_jobs j
                     WHERE j.account_id = a.id AND j.status IN ('queued', 'leased'))
              AND COALESCE(
                    (SELECT max(d.finished_at) FROM sync_jobs d
                      WHERE d.account_id = a.id AND d.status = 'done'),
                    'epoch'::timestamptz
                  ) < now() - make_interval(secs => $1)
           ON CONFLICT (account_id) WHERE status IN ('queued', 'leased') DO NOTHING
           RETURNING id, account_id, reason;`,
    values: [Math.round(intervalMs / 1000)],
  };
}

/**
 * Claim work. FOR UPDATE SKIP LOCKED is what makes this safe for more than one
 * worker without any coordination: two agents leasing at the same instant get
 * disjoint sets instead of blocking or double-syncing.
 *
 * `attempts` increments on lease, not on failure — an agent that dies without
 * reporting anything has still consumed a try, so a crash loop still backs off.
 */
export function leaseQuery(workerId, limit = 1, leaseMs = LEASE_MS) {
  return {
    text: `WITH picked AS (
             SELECT id FROM sync_jobs
              WHERE status = 'queued' AND run_after <= now()
              ORDER BY run_after, id
              FOR UPDATE SKIP LOCKED
              LIMIT $2
           )
           UPDATE sync_jobs j
              SET status = 'leased',
                  leased_by = $1,
                  leased_at = now(),
                  lease_expires_at = now() + make_interval(secs => $3),
                  attempts = j.attempts + 1
             FROM picked
            WHERE j.id = picked.id
          RETURNING j.id, j.account_id, j.reason, j.attempts;`,
    values: [workerId, limit, Math.round(leaseMs / 1000)],
  };
}

/**
 * Everything the agent needs for a leased job, in one read. `password_ct` is
 * still ciphertext here: this module never touches the key, so a query log or a
 * stack trace from it cannot leak a credential.
 *
 * `since` is the newest close time we already hold for the account, minus a
 * lookback — the backend decides the window, never the box, whose clock and
 * timezone we do not control.
 */
export function leasedPayloadQuery(jobIds, lookbackMs = 48 * 60 * 60 * 1000) {
  return {
    text: `SELECT j.id            AS job_id,
                  j.reason,
                  j.attempts,
                  a.id            AS account_id,
                  a.mt5_login,
                  a.ingest_token,
                  c.server,
                  c.firm_key,
                  c.password_ct,
                  c.verified_at,
                  GREATEST(
                    COALESCE((SELECT max(t.close_time) FROM trades t
                               WHERE t.account_id = a.mt5_login), 'epoch'::timestamptz)
                      - make_interval(secs => $2),
                    'epoch'::timestamptz
                  )               AS since
             FROM sync_jobs j
             JOIN mt5_accounts a    ON a.id = j.account_id
             JOIN mt5_credentials c ON c.account_id = a.id
            WHERE j.id = ANY($1::bigint[]);`,
    values: [jobIds, Math.round(lookbackMs / 1000)],
  };
}

/** Mark a job done and record what it moved, for the account's sync status UI. */
export function completeQuery(jobId, stats = {}) {
  return {
    text: `UPDATE sync_jobs
              SET status = 'done', finished_at = now(), error = NULL, stats = $2::jsonb,
                  leased_by = NULL, lease_expires_at = NULL
            WHERE id = $1 AND status = 'leased'
          RETURNING id, account_id, stats;`,
    values: [jobId, JSON.stringify(stats ?? {})],
  };
}

/**
 * Record a failure. Below MAX_ATTEMPTS the job returns to the queue behind a
 * backoff; at the cap it is left `failed` with the error kept, because the user
 * needs to be told "your password stopped working" rather than have us retry it
 * into a lockout forever.
 */
export function failQuery(jobId, error) {
  return {
    text: `UPDATE sync_jobs
              SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'queued' END,
                  error = $2,
                  run_after = CASE WHEN attempts >= $3 THEN run_after
                                   ELSE now() + make_interval(
                                          secs => ($4::int[])[LEAST(GREATEST(attempts, 1), $3)]) END,
                  finished_at = CASE WHEN attempts >= $3 THEN now() ELSE NULL END,
                  leased_by = NULL, lease_expires_at = NULL
            WHERE id = $1 AND status = 'leased'
          RETURNING id, account_id, status, attempts, run_after;`,
    // The backoff step is chosen IN SQL from the attempts column, because that
    // is where the attempt count lives (leaseQuery incremented it). Computing it
    // in JS would need a read first, and would then be one attempt stale — which
    // is how a "backoff" silently stays at 60s forever.
    values: [jobId, String(error ?? '').slice(0, 1000), MAX_ATTEMPTS, BACKOFF_SECS],
  };
}

/**
 * Return leases whose holder went away. Without this, an agent killed mid-job
 * strands that account until someone notices — the exact silent failure a single
 * box is prone to.
 */
export function reclaimQuery() {
  return {
    text: `UPDATE sync_jobs
              SET status = 'queued', leased_by = NULL, lease_expires_at = NULL
            WHERE status = 'leased' AND lease_expires_at < now()
          RETURNING id, account_id, attempts;`,
    values: [],
  };
}

/**
 * The account's most recent job, for the sync-status panel. Ordered by id rather
 * than a timestamp because a requeued job keeps its row: id is the only
 * monotonic thing here.
 */
export function lastJobQuery(accountId) {
  return {
    text: `SELECT id, status, reason, attempts, run_after, finished_at, error, stats, created_at
             FROM sync_jobs
            WHERE account_id = $1
            ORDER BY id DESC
            LIMIT 1;`,
    values: [accountId],
  };
}

/** Liveness. The agent calls this whether or not it found work to do. */
export function heartbeatQuery(workerId, version = null, note = null) {
  return {
    text: `INSERT INTO sync_workers (worker_id, last_seen, version, note)
           VALUES ($1, now(), $2, $3)
           ON CONFLICT (worker_id) DO UPDATE
              SET last_seen = now(), version = EXCLUDED.version, note = EXCLUDED.note
          RETURNING worker_id, last_seen;`,
    values: [workerId, version, note],
  };
}

/** Workers that have gone quiet — the input to the "sync farm is down" alert. */
export function staleWorkersQuery(maxAgeMs = 15 * 60 * 1000) {
  return {
    text: `SELECT worker_id, last_seen, version
             FROM sync_workers
            WHERE last_seen < now() - make_interval(secs => $1)
            ORDER BY last_seen;`,
    values: [Math.round(maxAgeMs / 1000)],
  };
}

// ---------------------------------------------------------------------------
// Thin DB wrappers
// ---------------------------------------------------------------------------

const run = async (q) => (await query(q.text, q.values)).rows;

export const enqueue = async (accountId, reason) => (await run(enqueueQuery(accountId, reason)))[0] ?? null;
export const enqueueDue = (intervalMs) => run(dueAccountsQuery(intervalMs));
export const leaseJobs = (workerId, limit, leaseMs) => run(leaseQuery(workerId, limit, leaseMs));
export const leasedPayloads = (jobIds, lookbackMs) =>
  jobIds.length ? run(leasedPayloadQuery(jobIds, lookbackMs)) : Promise.resolve([]);
export const completeJob = async (jobId, stats) => (await run(completeQuery(jobId, stats)))[0] ?? null;
export const failJob = async (jobId, error) => (await run(failQuery(jobId, error)))[0] ?? null;
export const reclaimExpired = () => run(reclaimQuery());
export const lastJob = async (accountId) => (await run(lastJobQuery(accountId)))[0] ?? null;
export const heartbeat = (workerId, version, note) => run(heartbeatQuery(workerId, version, note));
export const staleWorkers = (maxAgeMs) => run(staleWorkersQuery(maxAgeMs));
