-- A CHALLENGE THAT SPANS SEVERAL ACCOUNTS.
--
-- WHAT WAS WRONG WITH THE OLD MODEL. Migration 0016 made `challenges` one row per
-- PHASE ATTEMPT on an account, with a partial unique index allowing one ACTIVE row
-- per account, and /api/prop/advance walking an account from p1 to p2 to funded by
-- closing one row and opening the next. That is not how a prop firm works: passing
-- Phase 1 gets the trader a BRAND NEW LOGIN for Phase 2. So the thing the trader
-- calls "my GFT 2-Step 25K challenge" is two, three or four accounts, and the app
-- had nowhere to say they were the same challenge — Prop OS drew each as a separate
-- challenge, and adding the Phase 2 account looked identical to starting over.
--
-- WHAT THIS ADDS. A challenge_group is the challenge the trader means. It owns N
-- accounts (one per phase, plus a re-take where there is one); each account keeps
-- its own `challenges` rows exactly as before, which stay the per-phase RULE
-- SNAPSHOT the engine scores against. Nothing about how a phase is judged changes
-- here — this is only the container the phases hang from.
--
-- WHY THE LINK IS ON mt5_accounts AND NOT ON challenges. An account belongs to
-- exactly one challenge (it is one phase of one journey), while an account has many
-- challenge rows — one per attempt at its phase. Hanging the link off `challenges`
-- would repeat it on every retake row and make "which accounts are in this
-- challenge" a join through history. It also puts the link on the row that
-- listAccounts() already selects, so every client that holds the account list can
-- group by challenge with no second request.
CREATE TABLE IF NOT EXISTS challenge_groups (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Scoped to the OWNER, not to an account: the group exists to be found by the
    -- Add Account wizard before its next account exists, and ON DELETE CASCADE
    -- keeps a deleted user's challenges from outliving them.
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The challenge's identity, which is the same for every phase in it: which
    -- firm, which product, what size. Copied onto the group rather than read off
    -- the first account, because the group has to answer "is this the challenge you
    -- mean" in a list where none of its accounts may be loaded.
    firm_id       TEXT,
    firm_name     TEXT,
    product_id    TEXT,
    start_balance NUMERIC,

    -- 'active' | 'passed' | 'failed'. WRITTEN AUTOMATICALLY, and only one of the
    -- three transitions is: any phase account breaching its drawdown fails the
    -- whole challenge (owner spec, 2026-08-27), because a firm that takes your
    -- Phase 2 account does not leave the challenge open. 'passed' is reserved for
    -- the end of the journey and is not yet written by anything — a funded phase
    -- carries no profit target, so there is no threshold for it to cross.
    status        TEXT NOT NULL DEFAULT 'active',

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    passed_at     TIMESTAMPTZ,
    failed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_challenge_groups_user ON challenge_groups (user_id, status);

-- ON DELETE SET NULL, not CASCADE: deleting one phase's account must not delete the
-- challenge its siblings are still in. An account with a null group is a challenge
-- of one, which is what every account was before this migration.
ALTER TABLE mt5_accounts
  ADD COLUMN IF NOT EXISTS challenge_group_id BIGINT REFERENCES challenge_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mt5_accounts_group ON mt5_accounts (challenge_group_id);

-- BACKFILL: one group per existing PROP account.
--
-- One group EACH, deliberately, rather than trying to guess which existing accounts
-- were phases of one challenge. The signals available — same firm, same size, one
-- passed and one active — also describe two separate challenges a trader ran at the
-- same firm for the same amount, which is the commonest thing in this product. A
-- wrong merge would show one challenge where there were two and put a phase account
-- under a journey it was never part of; the trader can see two cards and we cannot
-- see their intent. Going forward the wizard records the link at creation.
--
-- Live accounts get nothing: capital_kind 'live' means the money is the trader's,
-- there is no firm and no phase, and 0026 exists precisely to stop prop machinery
-- being attached to them.
--
-- A LOOP, NOT AN INSERT..SELECT PLUS AN UPDATE..FROM, and the reason is a real
-- mis-pairing rather than taste. The pairing key available to a set-based backfill is
-- (user_id, firm_id, product_id, start_balance, created_at) — and two accounts of one
-- user can share every one of those, which is exactly the trader who bought two
-- identical challenges at the same firm in the same minute. `NOT EXISTS` cannot save
-- it either: an UPDATE sees the snapshot from before its own writes, so both accounts
-- can match the same group and the two challenges would be MERGED into one — the
-- precise error the paragraph above refuses to risk. Inserting inside a loop makes
-- the group id available to the account it was created from, so the pairing is by
-- primary key and cannot be ambiguous. It runs once, over prop accounts only.
DO $$
DECLARE
  acct RECORD;
  new_group_id BIGINT;
BEGIN
  FOR acct IN
    SELECT id, user_id, firm_id, firm_name, product_id, start_balance, created_at
      FROM mt5_accounts
     WHERE capital_kind = 'prop'
       AND challenge_group_id IS NULL
       AND user_id IS NOT NULL
     ORDER BY id
  LOOP
    INSERT INTO challenge_groups (user_id, firm_id, firm_name, product_id, start_balance, created_at)
    VALUES (acct.user_id, acct.firm_id, acct.firm_name, acct.product_id, acct.start_balance, acct.created_at)
    RETURNING id INTO new_group_id;

    UPDATE mt5_accounts SET challenge_group_id = new_group_id WHERE id = acct.id;
  END LOOP;
END $$;
