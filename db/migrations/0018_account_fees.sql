-- Challenge FINANCE tracking (Prop OS Overview). We already track payouts (money
-- IN); this tracks money OUT — the fees a trader pays a prop firm: evaluation
-- fees, resets, activation fees. Together they give true ROI per account/firm
-- (Total spent vs Total earned → Net, ROI %), à la TradeZella PropFirm Sync.
--
-- Mirrors the payouts table (0009): keyed by MT5 login (== trades.account_id),
-- no FK, so it lines up with per-account scope. Manual entry only for now (a firm
-- charges a card, not the MT5 terminal — bank-feed auto-detect is a later V2 item),
-- but the source/ext_ref columns keep the door open for an EA/import path.
CREATE TABLE IF NOT EXISTS account_fees (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id   BIGINT NOT NULL,                     -- MT5 login (== trades.account_id)
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fee_date     TIMESTAMPTZ NOT NULL,                -- when the charge happened
    amount       NUMERIC NOT NULL,                    -- amount paid (positive)
    fee_type     TEXT NOT NULL DEFAULT 'evaluation',  -- 'evaluation' | 'reset' | 'activation' | 'other'
    source       TEXT NOT NULL DEFAULT 'manual',      -- 'manual' | 'ea' | 'import'
    ext_ref      TEXT,                                -- dedup key for a future auto path; null for manual
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_fees_account_idx ON account_fees(account_id, fee_date DESC);
-- Idempotency for a future non-manual source (mirrors payouts_account_extref_uq).
CREATE UNIQUE INDEX IF NOT EXISTS account_fees_account_extref_uq ON account_fees(account_id, ext_ref) WHERE ext_ref IS NOT NULL;

-- Persist which prop FIRM an account belongs to, so spend + payouts can be
-- attributed per firm (the by-firm ROI breakdown). Set from the prop-firm
-- template picker (propFirms.js catalog id, e.g. 'gft' / 'ftmo'); null = custom.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS firm_id   TEXT;
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS firm_name TEXT;
