-- Live account state (balance/equity), upserted by the EA on each trade close.
-- One row per MT5 account. Trade rows reference account_id but we keep balance
-- here because it's account-level state, not a per-trade fact.
CREATE TABLE IF NOT EXISTS accounts (
    account_id  BIGINT PRIMARY KEY,
    balance     DOUBLE PRECISION,
    equity      DOUBLE PRECISION,
    currency    TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
