import { query } from '../../platform/db.js';
import { PLATFORM_IDS } from './platforms.js';

// The sync queue: which account gets a server-side terminal next, and what
// happens when that goes wrong.
//
// Split the way statsSql.js is split — the SQL lives in exported *builders* that
// return { text, values }, and the thin async wrappers below just run them. That
// keeps every query assertable in CI without a database, which is the only
// reason the parameterization here is testable at all.

// HOW OFTEN AN ACCOUNT IS SYNCED WITHOUT BEING ASKED.
//
// Three hours, not the fifteen minutes this started at. The change is about
// capacity, and the arithmetic is not close:
//
//   TradeLocker's rate limits are per-route and SHARED across every user,
//   because every request leaves one box with one egress IP. At 1000 accounts and
//   ~3 requests per sync, a 15-minute cadence needs ~3,000 requests to land inside
//   every 15-minute window -- ~3.3 req/s sustained and bursty, against a documented
//   per-route limit in the low single digits. It does not fit. At three hours the
//   same work spreads to ~0.3 req/s and does.
//
//   MT5 is worse and always was: one serial worker at roughly 90s per sync cannot
//   complete even 100 accounts inside 15 minutes, let alone 1000. The old interval
//   was a promise the farm could not keep once it had more than a handful of
//   accounts.
//
// A journal is a historical record, not a trading signal -- three hours is a
// defensible floor for the unattended case, and "Sync now" covers the impatient
// one. cTrader is the exception that proves it: it PUSHES, so its trades arrive in
// seconds and this interval is only its reconciliation pass.
//
// Per platform, because the platforms differ in what the interval is FOR. They are
// equal today; the shape is what matters, so changing one cannot silently change
// the others.
export const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;

export const PLATFORM_SYNC_INTERVAL_MS = {
  mt5: 3 * 60 * 60 * 1000,          // delivery; bounded by one serial Windows worker
  ctrader: 3 * 60 * 60 * 1000,      // RECONCILE only -- push is the delivery path
  tradelocker: 3 * 60 * 60 * 1000,  // delivery; bounded by a shared per-IP rate limit
};

/**
 * How long a user must wait between manual "Sync now" presses.
 *
 * ENFORCED SERVER-SIDE, and that is the whole point. A greyed-out button is a
 * suggestion; this is the rate limit. It matters most for TradeLocker, whose limit
 * is shared across all users from our single egress IP -- there, one impatient
 * trader hammering sync degrades every other customer's sync.
 */
export const MANUAL_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Is a manual sync still in cooldown, and for how much longer?
 *
 * Pure, so the rule is testable without a database or a clock.
 *
 * APPLIES REGARDLESS OF WHETHER THE LAST JOB SUCCEEDED. Letting a failed account
 * be retried freely inverts the purpose: an account that is failing is quite often
 * failing BECAUSE of a rate limit, and unlimited retries are exactly what must not
 * happen next. The queue's own backoff ladder is what retries a failure.
 */
export function manualCooldown(lastJob, now = Date.now(), cooldownMs = MANUAL_COOLDOWN_MS) {
  const finished = lastJob?.finished_at;
  if (!finished) return { blocked: false, retryAfterMs: 0 };
  const remaining = cooldownMs - (now - new Date(finished).getTime());
  return remaining > 0
    ? { blocked: true, retryAfterMs: remaining }
    : { blocked: false, retryAfterMs: 0 };
}

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
 * Queue one account. The platform is READ OFF THE ACCOUNT rather than passed in:
 * mt5_accounts is the only authority for it, and a caller that guessed wrong would
 * file the job on a fleet that cannot run it.
 *
 * The ON CONFLICT clause is the entire anti-pileup mechanism (the partial unique
 * index from 0025) — pressing "Sync now" twice must insert nothing, not build a
 * backlog the worker then grinds through serially.
 */
export function enqueueQuery(accountId, reason = 'manual') {
  return {
    text: `INSERT INTO sync_jobs (account_id, reason, platform)
           SELECT a.id, $2, a.platform FROM mt5_accounts a WHERE a.id = $1
           ON CONFLICT (account_id) WHERE status IN ('queued', 'leased') DO NOTHING
           RETURNING id, account_id, status, reason, run_after, platform;`,
    values: [accountId, reason],
  };
}

/**
 * Queue every account that is due. One statement rather than select-then-insert:
 * with more than one API worker, the read and the write would race and both
 * would queue the same account.
 *
 * Excluded: inactive accounts, manual (non-synced) accounts, anything synced
 * recently enough for its platform, and — ON MT5 ONLY — credentials whose last
 * login reported trade_allowed, which are master passwords awaiting deletion.
 */
export function dueAccountsQuery(intervalMs = SYNC_INTERVAL_MS, perPlatform = PLATFORM_SYNC_INTERVAL_MS) {
  const platforms = Object.keys(perPlatform);
  const seconds = platforms.map((p) => Math.round(perPlatform[p] / 1000));
  return {
    // The per-platform interval arrives as two parallel arrays unnested into a
    // CTE rather than as string-built SQL, so the cadence stays a bound parameter.
    // LEFT JOIN, not JOIN: a platform absent from the map must fall back to the
    // default, never vanish from the scheduler.
    text: `WITH intervals(platform, secs) AS (
             SELECT * FROM unnest($2::text[], $3::int[])
           )
           INSERT INTO sync_jobs (account_id, reason, platform)
           SELECT a.id,
                  CASE WHEN c.verified_at IS NULL THEN 'first_sync' ELSE 'schedule' END,
                  a.platform
             FROM mt5_accounts a
             JOIN mt5_credentials c ON c.account_id = a.id
             LEFT JOIN intervals i ON i.platform = a.platform
            WHERE a.is_active
              AND a.kind = 'synced'
              -- read_only = FALSE means DIFFERENT THINGS PER PLATFORM, so this
              -- rule is scoped to the one it is about. On MT5 it is a master
              -- password awaiting deletion and must never be retried. On
              -- TradeLocker EVERY credential is legitimately read_only = FALSE,
              -- because the platform offers no read-only alternative at all --
              -- left unscoped, this single line would silently queue no
              -- TradeLocker account ever, with no error anywhere.
              AND (a.platform <> 'mt5' OR c.read_only IS NOT FALSE)
              AND NOT EXISTS (
                    SELECT 1 FROM sync_jobs j
                     WHERE j.account_id = a.id AND j.status IN ('queued', 'leased'))
              AND COALESCE(
                    (SELECT max(d.finished_at) FROM sync_jobs d
                      WHERE d.account_id = a.id AND d.status = 'done'),
                    'epoch'::timestamptz
                  ) < now() - make_interval(secs => COALESCE(i.secs, $1))
           ON CONFLICT (account_id) WHERE status IN ('queued', 'leased') DO NOTHING
           RETURNING id, account_id, reason, platform;`,
    values: [Math.round(intervalMs / 1000), platforms, seconds],
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
export function leaseQuery(workerId, limit = 1, leaseMs = LEASE_MS, platforms = ['mt5']) {
  return {
    text: `WITH picked AS (
             SELECT id FROM sync_jobs
              WHERE status = 'queued' AND run_after <= now() AND platform = ANY($4)
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
          RETURNING j.id, j.account_id, j.reason, j.attempts, j.platform;`,
    values: [workerId, limit, Math.round(leaseMs / 1000), platforms],
  };
}

/**
 * Which platforms is this worker claiming it can run?
 *
 * ABSENT MEANS MT5, deliberately. The Windows agent will not send this field when
 * the change deploys, and that box is stopped most of the time — so it may be weeks
 * before it is updated. Defaulting to MT5 keeps the only worker we have working
 * untouched.
 *
 * An all-unknown list also falls back to MT5 rather than returning []: `= ANY('{}')`
 * matches no rows, so an empty list would leave the worker polling forever with no
 * error anywhere — the exact silent-stop failure mode the heartbeat exists to catch.
 */
export function requestedPlatforms(body) {
  const raw = Array.isArray(body?.platforms) ? body.platforms : [];
  const known = [...new Set(raw.map(String).filter((p) => PLATFORM_IDS.includes(p)))].slice(0, 10);
  return known.length ? known : ['mt5'];
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

/**
 * The payload for a leased cTRADER job.
 *
 * A SEPARATE QUERY, NOT A LOOSENED JOIN. leasedPayloadQuery INNER JOINs
 * mt5_credentials, and that join must stay strict: an MT5 job with no credential
 * is a real error and has to fail loudly. But a cTrader account has no row there
 * at all -- its credential is an OAuth token pair held at cTID grain on
 * ctrader_identities, shared by every account that identity owns.
 *
 * Serving cTrader through the MT5 query would return NO ROW: the job leases, the
 * worker is handed nothing, reports nothing, the lease expires, reclaimExpired
 * re-queues it, forever. No error, no failed job, no log line -- the account just
 * reads "Syncing now" until someone looks in the database. That is the failure
 * credentials.js documents for a missing credential, applied to a whole platform.
 *
 * `since` is computed exactly as the MT5 query computes it, so an account with no
 * trades collapses to epoch and a first sync means "everything" with no second
 * code path. `cursor_at` rides along so a worker killed mid-backfill resumes
 * instead of re-walking years of history.
 */
export function ctraderLeasedPayloadQuery(jobIds, lookbackMs = 48 * 60 * 60 * 1000) {
  return {
    text: `SELECT j.id            AS job_id,
                  j.reason,
                  j.attempts,
                  j.cursor_at,
                  a.id            AS account_id,
                  a.mt5_login,
                  a.ingest_token,
                  a.ctid_trader_account_id,
                  -- Landmine 10.7: demo and live are disjoint endpoints, and an
                  -- account authorized on the wrong socket fails in a way that
                  -- reads as a permissions problem. Stored at discovery, read
                  -- here, never recomputed.
                  a.is_live_env,
                  i.id            AS identity_id,
                  i.access_token_ct,
                  i.refresh_token_ct,
                  i.expires_at,
                  GREATEST(
                    COALESCE((SELECT max(t.close_time) FROM trades t
                               WHERE t.account_id = a.mt5_login), 'epoch'::timestamptz)
                      - make_interval(secs => $2),
                    'epoch'::timestamptz
                  )               AS since
             FROM sync_jobs j
             JOIN mt5_accounts a       ON a.id = j.account_id
             JOIN ctrader_identities i ON i.id = a.ctrader_identity_id
            WHERE j.id = ANY($1::bigint[]) AND i.revoked_at IS NULL;`,
    values: [jobIds, Math.round(lookbackMs / 1000)],
  };
}

/**
 * Leased jobs bucketed by platform, so each goes to the query that can serve it.
 *
 * `unknown` is not a tidiness bucket. A job with an absent or unrecognised
 * platform must surface, because silently dropping it recreates the same
 * lease-expire-reclaim spin that having one payload query caused in the first
 * place. The caller fails those jobs with a reason.
 */
export function splitJobsByPlatform(jobs = []) {
  const out = { mt5: [], ctrader: [], tradelocker: [], unknown: [] };
  for (const j of jobs) {
    const bucket = Object.prototype.hasOwnProperty.call(out, j?.platform) && j.platform !== 'unknown'
      ? j.platform
      : 'unknown';
    out[bucket].push(j.id);
  }
  return out;
}

/**
 * The job a worker is entitled to report on. Both conditions matter:
 *
 *  - `status = 'leased'` — a done/failed job is not reportable twice;
 *  - `leased_by = $2`   — only the lease holder may close it, so one worker
 *    cannot finish (or fail) work another worker is still doing.
 *
 * The row it returns is also the ONLY trustworthy source of the job's account_id.
 * Taking that from the request body would let any token-holding caller mutate any
 * account's credential, which is the whole reason this query exists.
 */
export function jobForWorkerQuery(jobId, workerId) {
  return {
    text: `SELECT id, account_id, status, attempts, reason
             FROM sync_jobs
            WHERE id = $1 AND status = 'leased' AND leased_by = $2;`,
    values: [jobId, workerId],
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
    // lease_expires_at is selected so the UI can tell "a worker is working on this"
    // apart from "a worker died holding this". Both are status='leased', and
    // without the expiry they look identical for up to ten minutes.
    text: `SELECT id, status, reason, attempts, run_after, finished_at, error, stats,
                  created_at, lease_expires_at
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
export const leaseJobs = (workerId, limit, leaseMs, platforms) =>
  run(leaseQuery(workerId, limit, leaseMs, platforms));
export const leasedPayloads = (jobIds, lookbackMs) =>
  jobIds.length ? run(leasedPayloadQuery(jobIds, lookbackMs)) : Promise.resolve([]);
export const ctraderLeasedPayloads = (jobIds, lookbackMs) =>
  jobIds.length ? run(ctraderLeasedPayloadQuery(jobIds, lookbackMs)) : Promise.resolve([]);
export const completeJob = async (jobId, stats) => (await run(completeQuery(jobId, stats)))[0] ?? null;
export const failJob = async (jobId, error) => (await run(failQuery(jobId, error)))[0] ?? null;
export const reclaimExpired = () => run(reclaimQuery());
export const lastJob = async (accountId) => (await run(lastJobQuery(accountId)))[0] ?? null;
export const jobForWorker = async (jobId, workerId) => (await run(jobForWorkerQuery(jobId, workerId)))[0] ?? null;
export const heartbeat = (workerId, version, note) => run(heartbeatQuery(workerId, version, note));
export const staleWorkers = (maxAgeMs) => run(staleWorkersQuery(maxAgeMs));
