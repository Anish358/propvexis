-- Prop Engine core (Module B keystone). Two new tables + a small extension of the
-- per-account rule "template" on mt5_accounts.
--
-- WHY first-class challenges: a prop account is not a single static rule set — it
-- moves through PHASES (eval Phase 1 -> Phase 2 -> funded), each a reset with its
-- own baseline and rules. mt5_accounts (from 0008) holds the *current template*;
-- a `challenges` row is the *snapshot* of the rules a given phase is actually being
-- judged against, plus its live status. The prop engine computes drawdown / target /
-- trading-day state against the account's ACTIVE challenge.
--
-- WHY equity_snapshots: real prop firms enforce drawdown on FLOATING equity over
-- time, but we only store closed trades + one latest balance. The engine consumes
-- an "equity series"; when the EA feeds periodic snapshots here we get true floating
-- drawdown, otherwise the engine falls back to a series synthesized from closed
-- trades (works today + for manual/CSV accounts that never have a live feed).

-- 1. Extend the per-account rule template (mirrors 0008's daily_dd_pct etc.).
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS dd_type          TEXT NOT NULL DEFAULT 'static'; -- 'static' (floor fixed at start) | 'trailing' (floor follows peak)
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS min_trading_days INT  NOT NULL DEFAULT 0;         -- required active trading days (0 = no requirement)

-- 2. Challenges — one active per account (enforced below); history retained.
CREATE TABLE IF NOT EXISTS challenges (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- References the mt5_accounts PRIMARY KEY (not the mt5_login). Everywhere else
    -- "account_id" means the login; here we key on the stable internal id so a
    -- challenge exists even before a synced account binds its login, and cascades
    -- on account delete. The engine joins to mt5_login to pull the account's trades.
    mt5_account_id        BIGINT NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,

    phase                 TEXT NOT NULL DEFAULT 'p1',      -- 'p1' | 'p2' | 'funded'
    status                TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'passed' | 'breached'
    dd_type               TEXT NOT NULL DEFAULT 'static',  -- 'static' | 'trailing'

    -- Rule snapshot for THIS phase (independent of later template edits).
    start_balance         NUMERIC,                          -- baseline the DD floor + target are measured from
    daily_dd_pct          NUMERIC NOT NULL DEFAULT 4,        -- daily loss limit, % of baseline
    max_dd_pct            NUMERIC NOT NULL DEFAULT 10,       -- overall loss limit, % of baseline
    profit_target_pct     NUMERIC,                           -- eval target, % of baseline; NULL for funded (no target)
    min_trading_days      INT NOT NULL DEFAULT 0,            -- min active days; for funded, counted PER payout cycle
    min_days_reset_on_payout BOOLEAN NOT NULL DEFAULT TRUE,  -- funded: the trading-day counter resets after each payout

    start_date            TIMESTAMPTZ NOT NULL DEFAULT now(),
    passed_at             TIMESTAMPTZ,
    breached_at           TIMESTAMPTZ,
    breach_reason         TEXT,                              -- 'daily_dd' | 'max_dd' | null
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_account ON challenges (mt5_account_id);
-- Invariant: an account has at most one ACTIVE challenge at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_challenges_one_active
    ON challenges (mt5_account_id) WHERE status = 'active';

-- 3. Equity snapshots — EA-fed floating equity samples, keyed by MT5 login like
-- the accounts/payouts tables (the ingest world speaks login). Idempotent on
-- (account_id, ts) so EA re-sends are no-ops.
CREATE TABLE IF NOT EXISTS equity_snapshots (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id  BIGINT NOT NULL,                 -- MT5 login (== trades.account_id / accounts.account_id)
    ts          TIMESTAMPTZ NOT NULL,            -- sample time (broker/server clock)
    balance     DOUBLE PRECISION,
    equity      DOUBLE PRECISION,
    source      TEXT NOT NULL DEFAULT 'ea',      -- 'ea' | (future) 'metaapi'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equity_snapshots_acct_ts ON equity_snapshots (account_id, ts DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_equity_snapshots_acct_ts ON equity_snapshots (account_id, ts);

-- 4. Backfill: one ACTIVE challenge per existing account, seeded from its template.
-- Funded accounts get phase='funded' and NO profit target; everything else starts
-- at 'p1' carrying its configured target. Idempotent — only inserts for accounts
-- that don't already have a challenge.
INSERT INTO challenges (mt5_account_id, phase, status, dd_type, start_balance,
                        daily_dd_pct, max_dd_pct, profit_target_pct, min_trading_days,
                        start_date)
SELECT a.id,
       CASE WHEN a.account_type = 'funded' THEN 'funded' ELSE 'p1' END,
       'active',
       a.dd_type,
       a.start_balance,
       a.daily_dd_pct,
       a.max_dd_pct,
       CASE WHEN a.account_type = 'funded' THEN NULL ELSE a.profit_target_pct END,
       a.min_trading_days,
       -- Anchor the initial cycle to the account's real history, not migration
       -- time, so pre-existing trades count toward trading-days. (Going forward,
       -- payouts / phase advances set start_date meaningfully.)
       COALESCE((SELECT MIN(close_time) FROM trades WHERE account_id = a.mt5_login),
                a.created_at, now())
  FROM mt5_accounts a
 WHERE NOT EXISTS (SELECT 1 FROM challenges c WHERE c.mt5_account_id = a.id);
