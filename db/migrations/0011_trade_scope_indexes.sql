-- Composite indexes for the hot "scoped + ordered" trade query paths.
--
-- Every dashboard/list query filters by a scope (account_id for a single
-- account, user_id for the god/strategy view) and orders by close_time. The
-- pre-existing indexes served only the FILTER:
--   * UNIQUE (account_id, mt5_ticket)  -> account_id filter, but 2nd col is the
--                                         ticket, so close_time still sorted in memory
--   * idx_trades_user (user_id)        -> user_id filter, sort still in memory
--   * idx_trades_close_time (close_time DESC) -> no scope-less close_time query exists
--
-- These composites serve the WHERE and the ORDER BY from a single index scan
-- (B-tree scans backward for the ASC path, so one DESC index covers both):
--   * GET /api/trades      WHERE account_id = ? ORDER BY close_time DESC
--   * computeStats/Yearly  WHERE user_id = ?    ORDER BY close_time ASC
CREATE INDEX IF NOT EXISTS idx_trades_account_close ON trades (account_id, close_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_close    ON trades (user_id, close_time DESC);

-- Now redundant, so drop them to remove write amplification on the ingest hot
-- path: idx_trades_user's column is a strict prefix of idx_trades_user_close,
-- and no query orders by close_time without a scope filter.
DROP INDEX IF EXISTS idx_trades_user;
DROP INDEX IF EXISTS idx_trades_close_time;

-- NOTE: plain CREATE INDEX takes a brief write lock while it builds. The trades
-- table is small today so this is milliseconds. Once it grows large, build new
-- indexes with CREATE INDEX CONCURRENTLY (which cannot run inside the migration
-- runner's transaction — apply those out-of-band).
