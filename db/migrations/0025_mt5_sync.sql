-- Server-side MT5 sync: the tables behind the self-hosted terminal farm.
--
-- Until now the only live trade source was the EA, running inside a terminal on
-- the trader's own PC. Trades taken on the MT5 mobile app never reached the
-- journal at all. This migration adds what a server-side terminal needs: a place
-- to keep the account's read-only credential, a job queue the off-box worker
-- leases from, and a heartbeat so a dead worker is noticed.
--
-- Nothing here touches the ingest path. The worker posts the same JSON to the
-- same four endpoints the EA uses, with the account's own ingest_token, so
-- dedup, derivation and alerting are unchanged.

-- One credential per account. INVESTOR (read-only) passwords only: `read_only`
-- records what the terminal reported via account_info().trade_allowed on the
-- last login, so "we only read, never trade" is a checked fact and not a claim.
-- NULL means never logged in yet; FALSE means the user handed us a master
-- password and the row is due for deletion, not use.
--
-- The MT5 login itself is deliberately NOT duplicated here — it lives in
-- mt5_accounts.mt5_login, which is also what trades.account_id joins against.
-- Two copies of the same login is how they drift.
CREATE TABLE IF NOT EXISTS mt5_credentials (
    account_id   BIGINT PRIMARY KEY REFERENCES mt5_accounts(id) ON DELETE CASCADE,
    server       TEXT NOT NULL,          -- MT5 server name, e.g. 'GoatFunded-Server'
    firm_key     TEXT,                   -- which portable MT5 build to log in with
    password_ct  TEXT NOT NULL,          -- AES-256-GCM, 'v1.<iv>.<tag>.<ct>' base64
    read_only    BOOLEAN,                -- NULL = unverified; FALSE = master password, reject
    verified_at  TIMESTAMPTZ,            -- last successful login
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The queue. One row per sync attempt, leased by a worker with FOR UPDATE SKIP
-- LOCKED. Kept in Postgres rather than Redis because Redis is not provisioned,
-- native PG on the app box binds to localhost (so the off-box worker talks HTTP
-- either way), and the table doubles as the audit trail a trader's "where is my
-- trade" question needs.
CREATE TABLE IF NOT EXISTS sync_jobs (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id       BIGINT NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'queued',   -- queued | leased | done | failed
    reason           TEXT NOT NULL DEFAULT 'schedule', -- schedule | manual | first_sync
    attempts         INTEGER NOT NULL DEFAULT 0,
    run_after        TIMESTAMPTZ NOT NULL DEFAULT now(),  -- backoff gate
    leased_by        TEXT,
    leased_at        TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,                      -- reclaim if the agent dies mid-job
    finished_at      TIMESTAMPTZ,
    error            TEXT,
    stats            JSONB,                            -- {trades, payouts, equity} for the UI
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The lease scan is "oldest runnable job first", so index exactly that.
CREATE INDEX IF NOT EXISTS idx_sync_jobs_runnable
    ON sync_jobs (status, run_after);

-- At most ONE open job per account. This single index is the whole anti-pileup
-- mechanism: a user hammering "Sync now" while a job is queued or in flight
-- inserts nothing instead of building a backlog the worker then has to grind
-- through serially.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_jobs_one_open_per_account
    ON sync_jobs (account_id)
    WHERE status IN ('queued', 'leased');

-- Heartbeat. With a single box there is no redundancy, so the failure mode is
-- silence: the agent dies and syncing simply stops. A stale last_seen is what
-- turns that into an alert.
CREATE TABLE IF NOT EXISTS sync_workers (
    worker_id  TEXT PRIMARY KEY,
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    version    TEXT,
    note       TEXT
);
