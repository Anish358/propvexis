-- WHAT A CHALLENGE COST, asked once — in the Add Account wizard, on the New
-- challenge branch only (owner spec 2026-09-02).
--
-- WHY A COLUMN AND NOT JUST A FEE ROW. The money itself belongs in account_fees
-- (0018): that table already means "money OUT to a prop firm", already carries
-- 'evaluation' and 'activation' as fee types, and every finance surface we have —
-- the ROI summary, the by-firm breakdown, the progression chart, the ledger — is a
-- projection of it. So the wizard's amount becomes an account_fees row and needs no
-- new reader anywhere.
--
-- It cannot ALWAYS become one at provision time, and that is what this column is
-- for. account_fees is keyed by MT5 LOGIN (== trades.account_id, no FK), and an EA
-- account has no login until its first trade binds one — provisionAccount writes
-- `mt5_login = NULL` and the terminal fills it in days later. Dropping the amount on
-- that path would silently lose money the trader typed, so it is stored HERE with
-- the account and the fee row is written the moment a login exists: inside the
-- provision transaction where there already is one, at bind time where there is not.
-- Both writes are the same idempotent INSERT, deduped on (account_id, ext_ref).
--
-- NOT A SECOND FIGURE TO DISPLAY. This column is the durable record of the answer
-- and the source for that deferred write; the account_fees row is the user-facing
-- fact, and it is the one thing that gets summed. Reading both as spend would
-- double-count every challenge, which is why this is deliberately absent from
-- ACCOUNT_COLUMNS and so never reaches a client.
--
-- NULL = not asked or not answered (a live account, a phase of an existing
-- challenge, an older account). 0 is a real answer — a free or comped challenge —
-- and writes no fee row, because nothing moved.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS challenge_fee NUMERIC;

COMMENT ON COLUMN mt5_accounts.challenge_fee IS
  'What the trader paid for this challenge, as entered in the Add Account wizard. Source for the account_fees row (ext_ref = provision:<account id>); never summed directly.';
