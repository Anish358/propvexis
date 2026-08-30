-- cTrader Open API connector: the tables an OAuth-connected platform needs.
--
-- WHY A NEW TABLE RATHER THAN mt5_credentials. The MT5 farm's credential is a
-- password belonging to ONE account. cTrader's credential is an OAuth token pair
-- belonging to a cTID -- a login identity that owns MANY trading accounts. Storing
-- it per account would keep N copies of the same token pair and refresh them N
-- times, and because the refresh token is CONSUMED on use, the second refresh of
-- a duplicated pair fails. The identity is the only correct grain.
--
-- Tokens are sealed by platform/secretbox.js under AAD 'ctrader-token:<id>',
-- reusing SYNC_CRED_KEY. A different AAD prefix from the MT5 farm's
-- 'mt5-cred:<account_id>' on purpose: a ciphertext moved between the two tables
-- must fail to open rather than decrypt into the wrong platform's login path.
CREATE TABLE IF NOT EXISTS ctrader_identities (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- NOT named `ctid`: that is a PostgreSQL SYSTEM column present on every table
    -- (the physical row tuple id), so `ctid BIGINT` is rejected outright with
    -- "column name ctid conflicts with a system column name".
    ctid_user_id      BIGINT,           -- cTID user id, learned at the first account list
    access_token_ct   TEXT NOT NULL,    -- AES-256-GCM, 'v1.<iv>.<tag>.<ct>'
    refresh_token_ct  TEXT NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    scope             TEXT NOT NULL,    -- 'accounts' (view only); re-asserted on each account list
    revoked_at        TIMESTAMPTZ,
    last_error        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One LIVE identity per cTID per user. The predicate is load-bearing: without it
-- a revoked identity would permanently block the user from reconnecting the same
-- cTID, which is exactly what they must do after a lost refresh-token rotation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrader_identities_live
    ON ctrader_identities (user_id, ctid_user_id) WHERE revoked_at IS NULL;

-- What the account picker offers between the OAuth callback and the user's
-- choice. A CACHE, not an authority -- the authority is whatever cTrader returns
-- next time. Listing accounts needs a protobuf socket, which is the worker's job
-- and not something the web tier grows a second implementation of, so the
-- callback enqueues a `discover` job and this is where the worker leaves the
-- answer.
CREATE TABLE IF NOT EXISTS ctrader_discovered_accounts (
    identity_id            BIGINT NOT NULL REFERENCES ctrader_identities(id) ON DELETE CASCADE,
    ctid_trader_account_id BIGINT NOT NULL,
    trader_login           BIGINT,      -- the number the trader recognises
    is_live                BOOLEAN NOT NULL,   -- which of the two sockets it belongs on
    broker_name            TEXT,
    deposit_currency       TEXT,
    registered_at          TIMESTAMPTZ, -- ProtoOATrader.registrationTimestamp: the backfill floor
    discovered_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (identity_id, ctid_trader_account_id)
);

ALTER TABLE mt5_accounts
    ADD COLUMN IF NOT EXISTS ctrader_identity_id    BIGINT
        REFERENCES ctrader_identities(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ctid_trader_account_id BIGINT,
    -- The REAL login. mt5_login holds the BANDED value (4e12 + ctid account id)
    -- because mt5_login is UNIQUE across every tenant and a raw cTrader account
    -- number can collide with a stranger's MT5 login. See domain/sync/logins.js.
    ADD COLUMN IF NOT EXISTS platform_login         BIGINT,
    ADD COLUMN IF NOT EXISTS is_live_env            BOOLEAN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_accounts_ctid_account
    ON mt5_accounts (ctid_trader_account_id) WHERE ctid_trader_account_id IS NOT NULL;

-- Where a backfill got to. A cTrader first sync walks from the account's
-- registration date to now; without a checkpoint a worker killed mid-backfill
-- restarts from the beginning, and on a four-year account that is hours of
-- re-fetching to arrive back where it already was.
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS cursor_at TIMESTAMPTZ;
