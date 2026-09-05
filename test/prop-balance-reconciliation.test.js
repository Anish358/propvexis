import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceReconciliation, challengeState } from '../src/domain/prop/prop.js';

/* THE PROD BUG, REPLAYED (2026-09-05, account 32).
 *
 * A Spotware cTrader DEMO holding EUR 999.87 was added from the GoatFundedTrader
 * 2-Step 25K template, so challenges.start_balance = 25,000 while accounts.balance =
 * 999.87. The engine sized every rule off the first and scored it against the second:
 *
 *     Net P&L      -$0.13  (one trade -- correct)
 *     Max drawdown  $24,000.13 used of $2,500  -> full-width ACCOUNT BREACH banner
 *     Profit target -$24,000.13 / $2,000
 *
 * 25,000 - 999.87 = 24,000.13 exactly. The maths was right; the inputs were about two
 * different accounts, and nothing checked.
 */
const CHALLENGE = {
  phase: 'p1',
  status: 'active',
  dd_type: 'static',
  start_balance: 25000,
  daily_dd_pct: 5,
  max_dd_pct: 10,
  profit_target_pct: 8,
  min_trading_days: 0,
  start_date: '2026-09-05T14:33:54Z',
  first_on_account: true,
};
const ONE_TRADE = [{ close_time: '2026-09-05T18:00:00Z', pnl_money: -0.13 }];

test('the mismatch is detected, and reported with both numbers', () => {
  const state = challengeState({
    challenge: CHALLENGE, trades: ONE_TRADE, live: 999.87, asOf: new Date('2026-09-05T19:00:00Z'),
  });
  const c = state.balanceCheck;
  assert.equal(c.ok, false);
  assert.equal(c.expected, 24999.87, 'start_balance plus the account\'s own trades');
  assert.equal(c.reported, 999.87, "what the broker actually says the account holds");
  assert.equal(c.discrepancy, 24000, 'the number a trader can recognise on the screen');
  assert.equal(c.tolerance, 2500, 'the whole max-drawdown band');
  // Both are surfaced because the app CANNOT know which one is wrong: a demo account
  // added from the wrong template, or a real account whose balance read is stale.
  assert.equal(c.startBalance, 25000);
});

test('a mismatched broker balance no longer manufactures a breach', () => {
  const state = challengeState({
    challenge: CHALLENGE, trades: ONE_TRADE, live: 999.87, asOf: new Date('2026-09-05T19:00:00Z'),
  });
  // The whole point. Before this change: used 24,000.13 of a 2,500 limit.
  const used = state.maxDd.limit - state.maxDd.roomLeft;
  assert.equal(Math.round(used * 100) / 100, 0.13, 'one trade for 13 cents, and nothing else');
  assert.equal(state.maxDd.roomLeft, 2499.87);
  assert.equal(state.breach.breached, false);
  assert.equal(state.profitTarget.current, -0.13, 'was -24,000.13');
  assert.equal(state.currentEquity, 24999.87, 'the series, not the contradicting broker figure');
});

test('an AGREEING broker balance still wins — this must not disable live equity', () => {
  // The regression that would matter most. `live` is normally the best number here:
  // real floating equity, including open positions the journal cannot see. Suppressing
  // it whenever it differs at all would quietly turn every account back into a
  // closed-trades-only approximation.
  const state = challengeState({
    challenge: CHALLENGE, trades: ONE_TRADE, live: 24100, asOf: new Date('2026-09-05T19:00:00Z'),
  });
  assert.equal(state.balanceCheck.ok, true, '899.87 of float is inside a 2,500 band');
  assert.equal(state.currentEquity, 24100, 'the broker figure is used');
  assert.equal(state.maxDd.roomLeft, 1600);
});

test('a payout is not a mismatch', () => {
  // synthesizeEquity deliberately leaves payouts OUT of the curve (a withdrawal is not
  // a loss), but the broker's balance of course reflects them. Without the withdrawal
  // term, every funded account that had ever been paid would report a false mismatch —
  // which is worse than the bug being fixed, because it would hit real funded traders.
  const funded = { ...CHALLENGE, phase: 'funded', profit_target_pct: null, start_balance: 100000 };
  const trades = [{ close_time: '2026-08-01T10:00:00Z', pnl_money: 8000 }];
  const payouts = [{ payout_date: '2026-08-20', gross_amount: 6000 }];
  const check = balanceReconciliation({
    challenge: funded,
    series: [{ ts: new Date('2026-07-01'), equity: 100000 },
      { ts: new Date('2026-08-01T10:00:00Z'), equity: 108000 }],
    payouts,
    live: 102000,                                   // 100,000 + 8,000 - 6,000
  });
  assert.equal(check.ok, true);
  assert.equal(check.expected, 102000);
  assert.equal(check.discrepancy, 0);
  // And the state keeps using the live figure.
  const state = challengeState({ challenge: funded, trades, payouts, live: 102000 });
  assert.equal(state.currentEquity, 102000);
});

test('gross_amount is what leaves the account, not the trader\'s split', () => {
  // A payout of 6,000 at an 80% split pays the trader 4,800 — but 6,000 is what the
  // trading account loses, and the balance we are reconciling against is the trading
  // account's. Reading trader_amount would leave a 1,200 phantom discrepancy per payout.
  const check = balanceReconciliation({
    challenge: { start_balance: 100000, max_dd_pct: 10 },
    series: [{ ts: new Date(), equity: 100000 }],
    payouts: [{ gross_amount: 6000, trader_amount: 4800, split_pct: 80 }],
    live: 94000,
  });
  assert.equal(check.expected, 94000);
  assert.equal(check.ok, true);
});

test('nothing to compare returns null, which is not "they agree"', () => {
  // An account with no broker balance yet (never synced, or manual) must not be
  // reported as mismatched, and must not be reported as reconciled either — there is
  // simply no answer. The UI draws nothing for null.
  assert.equal(balanceReconciliation({ challenge: CHALLENGE, series: [], live: null }), null);
  assert.equal(balanceReconciliation({ challenge: { start_balance: null }, live: 100 }), null);
  const state = challengeState({ challenge: CHALLENGE, trades: ONE_TRADE, live: null });
  assert.equal(state.balanceCheck, null);
});

test('a challenge with no max_dd_pct still gets checked', () => {
  // Falling back to "no rule, no check" would switch the guard off for exactly the
  // sloppily-configured accounts most likely to be mismatched. 10% mirrors the default
  // mt5_accounts COALESCEs that column to.
  const check = balanceReconciliation({
    challenge: { start_balance: 25000, max_dd_pct: null },
    series: [{ ts: new Date(), equity: 25000 }],
    live: 999.87,
  });
  assert.equal(check.tolerance, 2500);
  assert.equal(check.ok, false);
});

test('the tolerance is the band, so a disagreement exactly at it still passes', () => {
  // Inclusive, stated once, and checked — an off-by-one here is a banner that appears
  // and disappears as a position floats across the boundary.
  const at = balanceReconciliation({
    challenge: { start_balance: 10000, max_dd_pct: 10 },
    series: [{ ts: new Date(), equity: 10000 }],
    live: 9000,                                     // exactly 1,000 out of a 1,000 band
  });
  assert.equal(at.discrepancy, 1000);
  assert.equal(at.ok, true);

  const past = balanceReconciliation({
    challenge: { start_balance: 10000, max_dd_pct: 10 },
    series: [{ ts: new Date(), equity: 10000 }],
    live: 8999.99,
  });
  assert.equal(past.ok, false);
});

test('a mismatch cannot settle the challenge as breached', () => {
  // resolveChallengeOutcome reads state.breach.breached and WRITES challenges.status.
  // A false breach there is not a display bug — it permanently fails the challenge and,
  // through groupOutcomeFor, the whole challenge group with it.
  const state = challengeState({
    challenge: CHALLENGE, trades: ONE_TRADE, live: 999.87, asOf: new Date('2026-09-05T19:00:00Z'),
  });
  assert.equal(state.breach.breached, false);
  assert.equal(state.breach.reason, null);
});
