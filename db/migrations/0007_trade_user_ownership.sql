-- Strategy model: trades can belong to a USER directly, with or without an
-- account. God view = "all my trades" (strategy-level), per-account view =
-- only that account's trades. So:
--   * account_id becomes nullable (account-less = imported history + manual entries)
--   * user_id is the direct owner (stamped on ingest from the account's owner,
--     or set directly for manual/imported trades)
ALTER TABLE trades ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_trades_user ON trades (user_id);
