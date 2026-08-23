-- Add Account flow, Phase A. Two things this table could not say before:
-- whose money is in the account, and what platform it is reached over.
--
-- WHY capital_kind EXISTS. Every column here is prop-shaped -- account_type
-- defaults to 'eval', daily_dd_pct to 5, max_dd_pct to 10, profit_target_pct to
-- 8 -- and routes/accounts.js creates a `challenges` row for EVERY account. So a
-- trader journaling their own live account was given an invented 5/10/8 rule set
-- and counted by Prop OS as an evaluation account with a profit target it does
-- not have. That is the bug this column fixes; the fix is completed in code by
-- provisionAccount, which creates no challenge when capital_kind = 'live'.
--
-- WHY THE DEFAULTS NEED NO BACKFILL. Every account that exists today is a
-- GFT/FTMO prop account reached over MT5, so 'prop' and 'mt5' are not merely
-- safe defaults, they are the truth for existing rows.
--
-- The three prop rule columns deliberately stay NOT NULL. On a live account they
-- keep their defaults and are never read: no challenge row exists and every prop
-- surface filters capital_kind. Loosening them instead would mean auditing every
-- reader in the prop engine for null-safety. The invariant is pinned by
-- test/capital-kind.test.js.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS capital_kind  TEXT NOT NULL DEFAULT 'prop';
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS platform      TEXT NOT NULL DEFAULT 'mt5';

-- The firm's challenge PRODUCT ('1step' | '2step' | 'instant'), paired with
-- firm_id from 0018. Nullable: a live account has no product, and neither does a
-- prop account whose rules were typed in by hand. firm_id + start_balance +
-- account_type cannot tell a 1-step account from a 2-step one, which is why this
-- is a column and not a derivation.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS product_id    TEXT;

-- How trades reach this account. `kind` has two values ('synced' | 'manual') for
-- four answers, and the pair it collapses -- typing trades in by hand versus
-- importing a statement -- is not recoverable afterwards.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS import_method TEXT;

-- Idempotency for POST /api/accounts/provision. A network drop after COMMIT but
-- before the response is exactly when a user presses the button again, and the
-- alternative to this column is a duplicate account at the end of a nine-step
-- flow.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS provision_key TEXT;

-- Backfill BEFORE the NOT NULL, or this fails on any non-empty table.
--
-- Reading mt5_credentials rather than switching on `kind` alone matters for at
-- least one real row: the FundedNext demo account was converted manual -> synced
-- by hand and does have a credential, so a kind-only backfill would file it as
-- 'ea' and the accounts table would claim it syncs by a route it does not use.
UPDATE mt5_accounts a
   SET import_method = CASE
         WHEN a.kind = 'manual' THEN 'manual'
         WHEN EXISTS (SELECT 1 FROM mt5_credentials c WHERE c.account_id = a.id) THEN 'auto_sync'
         ELSE 'ea'
       END
 WHERE a.import_method IS NULL;

ALTER TABLE mt5_accounts ALTER COLUMN import_method SET DEFAULT 'manual';
ALTER TABLE mt5_accounts ALTER COLUMN import_method SET NOT NULL;

-- import_method and kind must never disagree: kind is load-bearing (it decides
-- the synthetic negative login, the plan cap and sync eligibility) while
-- import_method is the finer-grained answer the UI collects. Two fields naming
-- the same fact drift unless something forbids it.
ALTER TABLE mt5_accounts DROP CONSTRAINT IF EXISTS mt5_accounts_import_method_kind_ck;
ALTER TABLE mt5_accounts ADD CONSTRAINT mt5_accounts_import_method_kind_ck CHECK (
      (import_method IN ('auto_sync', 'ea') AND kind = 'synced')
   OR (import_method IN ('file', 'manual')  AND kind = 'manual')
);

ALTER TABLE mt5_accounts DROP CONSTRAINT IF EXISTS mt5_accounts_capital_kind_ck;
ALTER TABLE mt5_accounts ADD CONSTRAINT mt5_accounts_capital_kind_ck
  CHECK (capital_kind IN ('prop', 'live'));

-- Partial: every pre-existing row is NULL here, and a plain UNIQUE would say the
-- same thing in Postgres, but the predicate states the intent out loud.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_accounts_provision_key
    ON mt5_accounts (provision_key) WHERE provision_key IS NOT NULL;

-- Which fleet can run this job. MT5 needs the Windows box and its portable
-- terminals; cTrader and TradeLocker will be plain Linux workers. Denormalized
-- from the account at enqueue so the lease scan stays one index read.
--
-- Default 'mt5' is also the backwards-compatibility story: the Windows agent will
-- not send a platform filter the moment this deploys (and that box is stopped most
-- of the time), so a missing filter must mean MT5. See requestedPlatforms().
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'mt5';

CREATE INDEX IF NOT EXISTS idx_sync_jobs_runnable_platform
    ON sync_jobs (platform, status, run_after);
