-- mt5_accounts — the ownership + metadata layer that makes the app multi-tenant.
-- Each row links one MT5 login (== trades.account_id) to a user, and carries the
-- per-account ingest token the EA must present. Trades are NOT modified: ownership
-- is resolved by joining trades.account_id = mt5_accounts.mt5_login.
--
-- Schema only — the ownership backfill for existing trades lives in
-- scripts/seed-accounts.js (so prod and local can assign different owners
-- without baking an email into a migration that runs everywhere).
CREATE TABLE IF NOT EXISTS mt5_accounts (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mt5_login     BIGINT NOT NULL UNIQUE,               -- == trades.account_id
    label         TEXT,                                 -- user-friendly name ("GFT Challenge #1")
    broker        TEXT,
    currency      TEXT,
    start_balance NUMERIC,                              -- per-account replacement for ACCOUNT_START
    ingest_token  TEXT UNIQUE,                          -- per-account EA secret (null = no live ingest)
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mt5_accounts_user ON mt5_accounts (user_id);
