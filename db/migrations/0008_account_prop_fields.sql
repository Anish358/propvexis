-- Prop-firm metadata for each MT5 account. These accounts are funded/eval prop
-- accounts (GoatFundedTrader), so the per-account dashboard needs the firm's
-- rule set: account type (eval vs funded) and the drawdown / profit-target
-- limits expressed as percentages of the starting balance. Limits are stored as
-- percentages (the natural way prop rules are quoted); the dashboard derives the
-- dollar figures from start_balance. Defaults match common GFT rules.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS account_type      TEXT    NOT NULL DEFAULT 'eval'; -- 'eval' | 'funded'
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS daily_dd_pct      NUMERIC NOT NULL DEFAULT 5;      -- daily loss limit, % of start
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS max_dd_pct        NUMERIC NOT NULL DEFAULT 10;     -- overall loss limit, % of start
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS profit_target_pct NUMERIC NOT NULL DEFAULT 8;      -- eval profit target, % of start
