-- EVERY TRADE BELONGS TO AN ACCOUNT, AND AN ACCOUNT'S DATA FOLLOWS IT.
--
-- WHAT WAS WRONG. Migration 0007 dropped trades.account_id NOT NULL so a CSV
-- import or a hand-entered strategy trade could be owned by a user and belong to
-- no account. Those rows are reachable from exactly one place — the "god view",
-- the only scope that filters by user_id instead of by account — so the nullable
-- column and the second scoping mode kept each other alive. Removing one without
-- the other silently hides data; this migration removes the storage half and the
-- application removes the scope half in the same change.
--
-- THIS DESTROYS ROWS. Both deletes below are irreversible, on the owner's explicit
-- instruction (2026-08-30): account-less trades are removed rather than re-homed
-- into a synthetic account. The RAISE NOTICEs are the only record of what went —
-- read them in the deploy log, and take a backup before running this on prod.

-- 1. Trades belonging to no account at all (imports + manual strategy trades).
-- 2. Trades whose account_id names a login with no mt5_accounts row. Equally
--    unlinked — the account they pointed at was deleted out from under them by the
--    old non-cascading delete — and the foreign key below cannot be added while
--    a single one survives.
DO $$
DECLARE
  orphans  BIGINT;
  dangling BIGINT;
BEGIN
  DELETE FROM trades WHERE account_id IS NULL;
  GET DIAGNOSTICS orphans = ROW_COUNT;

  DELETE FROM trades t
   WHERE NOT EXISTS (SELECT 1 FROM mt5_accounts a WHERE a.mt5_login = t.account_id);
  GET DIAGNOSTICS dangling = ROW_COUNT;

  RAISE NOTICE '0028: deleted % account-less trade(s) and % trade(s) pointing at a missing account', orphans, dangling;
END $$;

ALTER TABLE trades ALTER COLUMN account_id SET NOT NULL;

-- THE LINK BECOMES STRUCTURAL. mt5_accounts.mt5_login is UNIQUE (migration 0005),
-- so it is a legal foreign-key target. ON DELETE CASCADE is what makes deleting an
-- account take its trades with it: the delete path no longer has to remember, and a
-- future write path cannot reintroduce an account-less trade by forgetting to pass
-- the column. NOT VALID is deliberately NOT used — the two deletes above have
-- already cleared every row that could fail the check, and a validated constraint is
-- what lets the planner and future migrations trust it.
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_account_fk;
ALTER TABLE trades
  ADD CONSTRAINT trades_account_fk
  FOREIGN KEY (account_id) REFERENCES mt5_accounts (mt5_login) ON DELETE CASCADE;

-- ARCHIVAL FOR A CHALLENGE, WHICH IS NOT THE SAME QUESTION AS ITS STATUS.
-- challenge_groups.status is 'active' | 'passed' | 'failed' — what the challenge
-- DID. Archiving is what the trader wants to SEE, and a passed challenge is exactly
-- the kind a trader archives, so overloading status would destroy the record of the
-- pass. A separate flag, written by the reconciler in domain/prop/challengeGroups.js
-- whenever the group's accounts are archived, unarchived or deleted.
ALTER TABLE challenge_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE challenge_groups ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_challenge_groups_active ON challenge_groups (user_id, is_active);
