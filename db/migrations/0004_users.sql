-- Users — one row per person who logs in via Google.
-- Identity layer for the multi-tenant conversion. `google_sub` is Google's
-- stable, immutable account id (the `sub` claim) and is the real join key;
-- email can change, so it's kept for display/allowlist but not relied on for
-- identity. MT5 accounts (and through them, trades) hang off users via the
-- mt5_accounts table added in a later migration.
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    google_sub    TEXT NOT NULL UNIQUE,                 -- Google `sub` claim (stable account id)
    email         TEXT NOT NULL UNIQUE,                 -- lowercased
    name          TEXT,
    picture       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
