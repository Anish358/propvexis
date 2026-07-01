-- Payout tracking for FUNDED prop accounts. When a funded account withdraws
-- profit, the prop firm pays the trader their split of the gross withdrawal
-- (e.g. an 80% split on a $10k withdrawal = $8k to the trader). We store the
-- trader's split % on the account, and each withdrawal as a payout row keyed by
-- the MT5 login (== trades.account_id / accounts.account_id) so it lines up with
-- the equity curve and per-account scope.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS payout_split_pct NUMERIC NOT NULL DEFAULT 80; -- trader's share of a withdrawal, % (funded only)

CREATE TABLE IF NOT EXISTS payouts (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id   BIGINT NOT NULL,                 -- MT5 login (== trades.account_id)
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payout_date  TIMESTAMPTZ NOT NULL,            -- when the withdrawal happened
    gross_amount NUMERIC NOT NULL,                -- amount withdrawn from the account (positive)
    split_pct    NUMERIC NOT NULL,                -- trader's share %, snapshot at payout time
    source       TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'ea'
    ext_ref      TEXT,                            -- EA dedup key (deal ticket); null for manual
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_account_idx ON payouts(account_id, payout_date DESC);
-- One row per broker balance-operation deal (idempotent EA re-sends).
CREATE UNIQUE INDEX IF NOT EXISTS payouts_account_extref_uq ON payouts(account_id, ext_ref) WHERE ext_ref IS NOT NULL;
