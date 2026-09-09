// The oracle check, and spec §13.2's largest technical risk made visible.
//
// THERE IS NO REALIZED-P&L FIELD ANYWHERE IN TRADELOCKER'S API. Every trade's
// pnl_money is DERIVED by pairing.js from entry/exit/qty/contract size, and
// nothing about that derivation is checked against the broker's own numbers
// until this file runs. /trade/accounts/{id}/state -- resolved through
// accountDetailsConfig exactly like ordersHistory is resolved through its own
// config, confirmed against TradeLocker's live API reference -- publishes
// `balance` and `openNetPnL`, and BOTH ARE THE WRONG KIND OF NUMBER for a
// clean comparison: `balance` is the account's whole realized history
// (deposits and withdrawals included, which we cannot subtract out without a
// starting balance this job is never given), and `openNetPnL` is UNREALIZED
// P&L on positions still open, not the closed trades this job just derived.
//
// So this is deliberately NOT "the delta is exact." It is the best comparison
// obtainable from what TradeLocker actually publishes, computed and logged
// LOUDLY every job so a human has the raw numbers to look at -- which is
// exactly what spec §13.2 asks a live account to prove, or disprove, before
// Task 8 ever flips the catalog. computeDelta itself is pure and precise; the
// judgement about what it MEANS in production is the live-verification step's
// job, not this file's.

import { buildResolver, num } from '../../src/domain/sync/connectors/tradelocker/columns.js';
import { tlRequest } from './http.js';

const roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Pure arithmetic, directly testable against fixture numbers with no network.
 *
 * NULL PROPAGATES. A job that could not resolve a broker figure, or that
 * priced not one of its own trades (pnlCount === 0 and pnlSum is legitimately
 * 0 rather than "unknown" -- so pnlCount, not pnlSum, is what null-guards this),
 * returns a null delta rather than a misleadingly precise zero.
 */
export function computeDelta({ computedPnlSum, pnlCount, brokerBalance }) {
  if (brokerBalance == null || pnlCount === 0) return null;
  return roundMoney(computedPnlSum - brokerBalance);
}

/**
 * GET /trade/accounts/{accountId}/state, and the delta against what this job
 * itself just computed.
 *
 * NEVER THROWS ON A BAD OR MISSING FIGURE -- this runs after trades have
 * already been posted successfully, and failing the job over a reconciliation
 * READ would throw away real work for a number that exists purely to be
 * looked at (spec: "do not fail the job over it yet").
 */
export async function reconcile({
  host, token, accNum, accountId, config, computedPnlSum, pnlCount, fetchImpl = fetch, log = console,
}) {
  try {
    const res = await tlRequest(host, `trade/accounts/${accountId}/state`, { token, accNum, fetchImpl });
    const resolver = buildResolver(config, 'accountDetails');
    const row = Array.isArray(res?.d?.accountDetailsData) ? res.d.accountDetailsData : [];
    const brokerBalance = num(resolver.get(row, 'balance'));
    const brokerOpenPnl = num(resolver.get(row, 'openNetPnL'));
    const delta = computeDelta({ computedPnlSum, pnlCount, brokerBalance });

    const facts = { accountId, computedPnlSum, pnlCount, brokerBalance, brokerOpenPnl, delta };
    // LOUD ON PURPOSE, regardless of the size of the delta. There is no
    // "trivial" threshold this task can defend given the balance/pnl_money
    // scope mismatch documented above -- a human reading these logs during
    // live verification is the check, not a silent pass/fail here.
    log.info?.(facts, 'tradelocker reconcile');
    return facts;
  } catch (err) {
    log.error?.({ accountId, err: err.message }, 'tradelocker reconcile unavailable');
    return {
      accountId, computedPnlSum, pnlCount, brokerBalance: null, brokerOpenPnl: null, delta: null,
    };
  }
}
