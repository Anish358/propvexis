-- THE CONSISTENCY RULE — a prop firm's cap on how much of a trader's total profit
-- may come from their single best trading day (owner spec 2026-09-02).
--
-- WHAT THE RULE IS. best day / total profit <= consistency_pct. A firm running a 30%
-- rule with $3,000 of accumulated profit will not pay out while any one day accounts
-- for more than $900 of it. Thresholds in the wild run 15%-50%; 30% is the most
-- common, Apex sits at 50%, Top One's Ignite at 15%, and FTMO has no such rule at
-- all — which is why this column is NULLABLE rather than defaulted. NULL means the
-- account has no consistency rule, and that is the majority case.
--
-- IT IS A PAYOUT GATE, NOT A BREACH. Every firm we surveyed treats an oversized day
-- as a delay: the payout waits until further trading dilutes that day's share below
-- the cap. Nothing is forfeited and no account is closed. So the engine reports this
-- rule and NEVER contributes it to `breach` or to healthScore — a consistency figure
-- that could floor an account's health to 0 would be telling the trader they are out
-- when they are merely early.
--
-- TWO TABLES, AS EVERY OTHER RULE. mt5_accounts holds the account's current rule
-- template (what Settings edits, what the wizard writes); challenges holds the
-- SNAPSHOT the prop engine judges against, so a past phase keeps the rule it was
-- actually run under. This is exactly how min_trading_days and the four percentages
-- work (0016), and the pairing is what lets the engine keep its "rules are data,
-- never code" property — a firm with a consistency rule is a data change.
--
-- PER PHASE, WHICH IS WHY THE SNAPSHOT MATTERS MORE HERE THAN ELSEWHERE. Firms
-- commonly run a different cap on evaluation than on the funded account (Alpha
-- Futures: 50% eval, 40% funded) and some apply it on one side only (Apex funded
-- only; Take Profit Trader evaluation only). Advancing a phase copies the account's
-- template forward, and the trader corrects it if the firm's number changed.
ALTER TABLE mt5_accounts ADD COLUMN IF NOT EXISTS consistency_pct NUMERIC;
ALTER TABLE challenges    ADD COLUMN IF NOT EXISTS consistency_pct NUMERIC;

COMMENT ON COLUMN mt5_accounts.consistency_pct IS
  'Consistency rule: max share (%) of total profit allowed from the single best trading day. NULL = the account has no consistency rule.';
COMMENT ON COLUMN challenges.consistency_pct IS
  'Snapshot of the account''s consistency rule when this phase began. NULL = no consistency rule. A payout gate only — never a breach.';
