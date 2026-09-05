-- ACCOUNT LIFECYCLE — the three tiers, and the acknowledgement that moves an account
-- between them (owner spec 2026-09-05, docs/architecture/CLOSED-ACCOUNTS-AND-SCOPE.md).
--
-- WHAT THE PRODUCT DOES NOW. The engine already settles a challenge off the trading
-- (0016 + challengeStatus.js): hit the target with the days in and the row goes
-- 'passed', blow a limit and it goes 'breached'. What nothing recorded was whether the
-- TRADER had seen that happen. So this migration adds the trader's side of it: an
-- account that has settled stays in the dashboard exactly as it was until they
-- acknowledge the outcome, and only then leaves the dashboard's default scope.
--
-- WHY THE ACCOUNT COLUMN IS A DENORMALISATION AND NOT A DERIVATION. `closed_at` could
-- be computed from the latest challenge row's acknowledgement, and for correctness it
-- should be. It is a column because resolveScope() runs on EVERY api request and
-- ownedLogins() is a single-table read of mt5_accounts; deriving openness needs the
-- latest challenge per account — a DISTINCT ON or a lateral — on every one of those
-- requests, and this codebase is explicitly building to a 1000-concurrent-user bar.
-- The split of meaning is real rather than convenient: `challenges.acknowledged_at`
-- records WHICH OUTCOME the trader answered, `mt5_accounts.closed_at` records THAT THE
-- ACCOUNT IS DONE. They are written together, and the second outlives the first — a
-- funded account retired by hand has a closed_at and no settled challenge at all.
--
-- OPEN IS A NEGATIVE: an account is open unless something closed it. Stated the other
-- way round — "its challenge is active, or its outcome is unacknowledged" — every
-- account with no challenge row would fail both clauses, and live-capital, manual and
-- CSV accounts have no challenge row. They would have vanished from the dashboard on
-- deploy day. propAccounts.js already draws the same distinction for its buckets: a
-- state with no challenge at all is not 'evaluation by default'.

-- 1. THE SCOPE PREDICATE. NULL = open. Set when the trader acknowledges an outcome,
-- when the 7-day auto-acknowledgement fires, or when they retire an account by hand;
-- cleared by reopenChallenge() and by un-retiring.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ;

-- WHY A REASON RIDES ALONG. The switcher groups closed accounts under Passed and
-- Breached, and a funded account retired by hand is neither — it still has an ACTIVE
-- challenge row, because a funded phase never passes (profitTargetState returns null
-- when there is no target, and every funded row stores NULL there). Without this the
-- switcher would have to join challenges to label a group, which is the per-request
-- join the column above exists to avoid.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS closed_reason TEXT;

COMMENT ON COLUMN mt5_accounts.closed_at IS
  'The trader is done with this account. NULL = open (in the dashboard''s default scope). Set on acknowledge / auto-acknowledge / manual retire; cleared on reopen.';
COMMENT ON COLUMN mt5_accounts.closed_reason IS
  '''passed'' | ''breached'' | ''retired'' — how the account closed, so the switcher can group it without joining challenges. NULL when closed_at IS NULL.';

-- 2. WHICH OUTCOME THE TRADER ANSWERED, on the challenge row rather than the account.
--
-- An account accumulates many settled challenge rows: the partial unique index only
-- guarantees one ACTIVE row, and both advanceChallenge and reopenChallenge leave the
-- old ones in place. So pass -> close -> reopen -> trade -> pass again is an ordinary
-- sequence, and an account-level flag would already be set the second time round —
-- silently pre-acknowledging the pass that actually counted and eating its strip.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

-- 3. THE OUTCOME A REOPEN SILENCED — {status, reason, day} — because reopening without
-- it is a button that works for exactly one tick.
--
-- reopenChallenge() already puts a settled row back to 'active' correctly. What it has
-- no notion of is the engine that settled it: the next ingest runs
-- resolveChallengeOutcome, reads the same equity against the same rules, and settles it
-- again. The strip returns, forever. This column is what the caller checks before
-- writing an outcome.
--
-- KEYED TO THE EVENT, NOT TO A CLOCK, AND THE TWO OUTCOMES ARE KEYED DIFFERENTLY:
--
--   A BREACH is a rule plus a day. A different day is a different breach, so
--   {breached, max_dd, 2026-09-06} stays silent while a breach on the 7th speaks. That
--   is exactly what a trader disputing one bad day wants.
--
--   A PASS HAS NO SUCH DAY. Once the target is reached it stays reached — the trader is
--   up. Keyed to a day, tomorrow would be a "different event" and the strip would come
--   back every morning, which is the loop this column exists to prevent. So a pass
--   stores `day: null` and stays suppressed until the rules it was judged against
--   change (editing them clears this column) or the phase advances.
--
-- Rules-edit clearing is deliberate rather than a leak: when a trader says a pass is
-- wrong, the engine has usually not miscounted — the rules are wrong. Wrong target,
-- wrong minimum days, wrong start balance, wrong start date (start_date defaulting to
-- now() under-counted trading days on every account added mid-challenge, once). Fixing
-- the rules IS the fix, and re-evaluating against corrected rules is wanted immediately.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS suppressed_outcome JSONB;

-- THE TRADING DAY THAT PRODUCED THE OUTCOME, written when the row settles.
--
-- Needed because a rejection has to silence the breach the trader is LOOKING AT, not
-- the one happening the day they got round to clicking. A trader who blows the daily
-- limit on the 6th and disputes it on the 8th must silence the 6th — suppressing "today"
-- would leave the 6th's verdict live (the strip returns instantly) and pre-silence a
-- real breach on the 8th. `breached_at` cannot stand in for this: it is when the ingest
-- NOTICED, in UTC, and a trading day is the account's own broker-offset day.
--
-- NULL for a pass and for a max-DD breach, which is not missing data — those outcomes
-- do not belong to a day at all (see challengeStatus.js recursOnItsOwn).
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS outcome_day TEXT;

COMMENT ON COLUMN challenges.outcome_day IS
  'Broker-offset trading day (YYYY-MM-DD) that produced a daily_dd breach. NULL for a pass or a max_dd breach — neither belongs to a day.';
COMMENT ON COLUMN challenges.acknowledged_at IS
  'When the trader answered this row''s pass/breach. NULL on an active row, or on a settled row whose strip is still waiting.';
COMMENT ON COLUMN challenges.suppressed_outcome IS
  '{status, reason, day} the trader rejected via "Not passed yet"/"Still trading". day is NULL for a pass (it never stops being true). Cleared when the phase''s rules are edited.';

-- 4. BACKFILL — the deploy-day flood, and the reason this is a migration and not a
-- default.
--
-- Every column above starts NULL, and `open` is `closed_at IS NULL`. So without this
-- block, every account that passed or breached MONTHS ago is Open on the morning this
-- ships: back in the dashboard's default scope, each one raising a strip. A trader with
-- seven blown accounts opens the app to seven accounts back in their numbers and seven
-- things to acknowledge — precisely the flood the whole feature exists to prevent,
-- delivered on launch day.
--
-- Everything already settled is history, not news. Acknowledge all of it, dated to when
-- it actually happened rather than to now(), so the 7-day auto-acknowledgement window
-- and any future report read a true timeline.
UPDATE challenges
   SET acknowledged_at = COALESCE(passed_at, breached_at, now())
 WHERE status <> 'active' AND acknowledged_at IS NULL;

-- Then close the accounts whose story is over: a settled latest challenge and no active
-- one. An account mid-challenge (p1 passed, p2 running) has an active row and stays
-- open, which is correct — it is still being traded.
WITH latest AS (
    SELECT DISTINCT ON (c.mt5_account_id)
           c.mt5_account_id,
           c.status,
           COALESCE(c.passed_at, c.breached_at) AS settled_at
      FROM challenges c
     WHERE c.status <> 'active'
     ORDER BY c.mt5_account_id, COALESCE(c.passed_at, c.breached_at) DESC, c.id DESC
)
UPDATE mt5_accounts a
   SET closed_at     = COALESCE(l.settled_at, now()),
       closed_reason = l.status
  FROM latest l
 WHERE a.id = l.mt5_account_id
   AND a.closed_at IS NULL
   AND NOT EXISTS (
         SELECT 1 FROM challenges o
          WHERE o.mt5_account_id = a.id AND o.status = 'active');

-- 5. THE STORED SCOPE, which cannot survive this release meaning what it used to.
--
-- resolveScope() collapses null, '' and 'all' to the same answer — every owned account.
-- Once 'all' means "including closed accounts" specifically, it can no longer double as
-- the not-chosen sentinel, and every existing user has one of those three values saved
-- in user_view_state. Read as a deliberate pick, it would hand every current user a
-- dashboard full of their closed accounts on first load.
--
-- Nobody chose a value under semantics that did not exist yet: drop the key and let
-- each page fall back to its own default. (The client clears its localStorage copy the
-- same way, by reading a new key — App.jsx.)
UPDATE user_view_state
   SET state = state - 'accountId', updated_at = now()
 WHERE state ? 'accountId';

-- 6. The index the scope predicate now runs against. ownedLogins() filters
-- user_id + is_active + mt5_login IS NOT NULL + closed_at IS NULL on every request;
-- this is the hottest read in the app and it deserves its own partial index.
CREATE INDEX IF NOT EXISTS idx_mt5_accounts_open
    ON mt5_accounts (user_id)
    WHERE is_active AND closed_at IS NULL AND mt5_login IS NOT NULL;
