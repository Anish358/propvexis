-- Add normalized symbol base for brokers that use suffixes (EURUSD.r, XAUUSDm).
ALTER TABLE trades ADD COLUMN IF NOT EXISTS symbol_base TEXT;
CREATE INDEX IF NOT EXISTS idx_trades_symbol_base ON trades (symbol_base);
DROP INDEX IF EXISTS idx_trades_symbol;
