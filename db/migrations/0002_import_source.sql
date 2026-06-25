-- Support importing historical trades that only have computed metrics + tags
-- (from the spreadsheet) — no raw prices, direction, or MT5 ticket.
ALTER TABLE trades ALTER COLUMN mt5_ticket  DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN entry_price DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN exit_price  DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN direction   DROP NOT NULL;

-- Distinguish live EA trades from spreadsheet imports.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ea';
CREATE INDEX IF NOT EXISTS idx_trades_source ON trades (source);
