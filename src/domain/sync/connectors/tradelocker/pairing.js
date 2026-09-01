// Reconstructing completed trades from order history -- the core of the
// TradeLocker connector, and the thing that makes it harder than both connectors
// we already have.
//
// THERE IS NO CLOSED-POSITIONS ENDPOINT AND NO REALIZED-P&L FIELD. MT5 hands us
// closed deals. cTrader hands us a closing deal carrying grossProfit, swap,
// commission and the post-close balance. TradeLocker hands us ORDERS, and a
// completed trade has to be assembled from them:
//
//   ordersHistory (status = Filled)
//         |
//         +-- group by positionId
//         |
//         +-- earliest fill -> direction, entry price, open time
//         +-- later opposite-side fills -> one trade each
//                                              |
//                                  P&L computed by us, not given
//
// ONE ROW PER CLOSING FILL, keyed mt5_ticket = the closing order id -- not per
// position. A position can be closed in pieces; keying on positionId would make
// each partial close rewrite the last, showing one trade where the trader took
// three. This matches the cTrader connector's one-row-per-closing-deal rule.
//
// Pure: no network, no database, no clock.

import { num, int, str, ORDERS_HISTORY_FIELDS, assertFields } from './columns.js';

const FILLED = 'filled';

/** Long or short, from a TradeLocker side string. Anything else is not a fill. */
const sideOf = (raw) => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'buy') return 'buy';
  if (s === 'sell') return 'sell';
  return null;
};

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

/**
 * Money, or null.
 *
 * NULL IS A REAL ANSWER HERE. P&L is not cosmetic -- fixed_r and every downstream
 * R statistic derive from it, and Prop OS decides rule breaches on it. Where the
 * instrument metadata cannot price the move confidently, the number is written
 * NULL rather than approximated: a missing number surfaces in the UI, a plausible
 * wrong one does not.
 *
 * Deliberately NO FX conversion. When the quote currency is not the deposit
 * currency the raw difference is not "close enough" -- on USDJPY it is wrong by
 * roughly 150x while looking entirely plausible -- and a rate applied in the
 * wrong direction is the same failure with more code. Conversion belongs with the
 * worker that can reconcile its answer against /trade/accounts/{id}/state.
 */
/**
 * Money to the cent.
 *
 * NOT COSMETIC. 1.0925 has no exact binary representation, so the honest
 * subtraction (1.0925 - 1.09) * 100000 yields 249.99999999999466 -- a figure that
 * would be stored, summed across a thousand trades, and then compared against the
 * broker's own balance in the /state reconciliation, where the accumulated
 * residue reads as real drift in the derivation. The broker charges and reports
 * to the cent; so do we.
 */
const roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function computeMoney({ entry, exit, qty, commission, direction, instrument }) {
  const contractSize = num(instrument?.contractSize);
  const quote = str(instrument?.quoteCurrency);
  const deposit = str(instrument?.depositCurrency);
  if (entry == null || exit == null || qty == null) return null;
  if (!contractSize) return null;
  if (!quote || !deposit || quote !== deposit) return null;
  // Unknown commission is not zero commission: the cost is unknown, so the net
  // result is unknown too.
  if (commission == null) return null;
  const sign = direction === 'sell' ? -1 : 1;
  return roundMoney((exit - entry) * qty * contractSize * sign + commission);
}

/**
 * Filled orders -> completed trades.
 *
 * @param {object[]} rows   ordersHistory rows, positional arrays of strings
 * @param {object} resolver a by-name resolver from columns.js (NEVER an index)
 * @param {object} instrument { symbol, contractSize, quoteCurrency, depositCurrency }
 * @param {number} bandedLogin the 5e12-banded internal login (domain/sync/logins.js)
 *
 * @returns {{ trades: object[], unpaired: number[], malformed: (number|null)[] }}
 *   `unpaired` are positionIds we saw but could not complete -- still open, or
 *   with an opener in an earlier page. Reporting them is what lets the caller
 *   widen the backfill window; silently dropping them would be indistinguishable
 *   from a bug.
 */
export function pairOrders({ rows = [], resolver, instrument = {}, bandedLogin }) {
  assertFields(resolver, ORDERS_HISTORY_FIELDS);

  const groups = new Map();
  const malformed = [];

  for (const row of rows) {
    if (String(resolver.get(row, 'status') ?? '').trim().toLowerCase() !== FILLED) continue;
    const positionId = int(resolver.get(row, 'positionId'));
    if (positionId == null) {
      // Grouping id-less rows together would pair one instrument's fill against
      // another's and produce a trade that never happened.
      malformed.push(int(resolver.get(row, 'id')));
      continue;
    }
    const fill = {
      id: int(resolver.get(row, 'id')),
      side: sideOf(resolver.get(row, 'side')),
      qty: num(resolver.get(row, 'filledQty')),
      price: num(resolver.get(row, 'avgPrice')),
      at: num(resolver.get(row, 'createdDate')),
      commission: num(resolver.get(row, 'commission')),
    };
    if (!fill.side || fill.id == null) { malformed.push(fill.id); continue; }
    if (!groups.has(positionId)) groups.set(positionId, []);
    groups.get(positionId).push(fill);
  }

  const trades = [];
  const unpaired = [];

  for (const [positionId, fills] of groups) {
    // SORT BY createdDate, NOT BY ARRAY ORDER. The backfill walks ordersHistory
    // newest-first, so the closing order arrives BEFORE its opener; trusting the
    // array would make the close the "opener" and invert the trade. The id is the
    // tie-break for two fills sharing a millisecond.
    const sorted = [...fills].sort((a, b) => (a.at - b.at) || (a.id - b.id));
    const opener = sorted[0];
    const closers = sorted.slice(1).filter((f) => f.side !== opener.side);

    if (!closers.length) { unpaired.push(positionId); continue; }

    // The opening commission is charged ONCE for the whole position. Attaching it
    // whole to every partial close would double-count it; dropping it would
    // understate the cost of every trade in the journal. Apportion it by the share
    // of the opened quantity each close accounts for -- exact whenever commission
    // is proportional to volume, which is how forex and CFD commission is charged.
    const openedQty = opener.qty;
    const shareOfOpen = (qty) => {
      if (opener.commission == null) return null;
      if (!openedQty || qty == null) return opener.commission;
      return (opener.commission * qty) / openedQty;
    };

    for (const closer of closers) {
      const openShare = shareOfOpen(closer.qty);
      const commission =
        openShare == null || closer.commission == null
          ? null
          : roundMoney(openShare + closer.commission);
      trades.push({
        // Keyed on the CLOSING order, so a partial close is its own row.
        mt5_ticket: closer.id,
        account_id: Number(bandedLogin),
        symbol: str(instrument.symbol),
        // DIRECTION COMES FROM THE OPENER. The closing fill's side is the opposite
        // of the trade the trader took, so reading it here would invert every
        // direction in the journal while the win rate still looked fine.
        direction: opener.side,
        open_time: iso(opener.at),
        close_time: iso(closer.at),
        entry_price: opener.price,
        exit_price: closer.price,
        volume: closer.qty,
        commission,
        pnl_money: computeMoney({
          entry: opener.price,
          exit: closer.price,
          qty: closer.qty,
          commission,
          direction: opener.side,
          instrument,
        }),
      });
    }
  }

  // Stable output regardless of Map iteration order, so a re-read of the same
  // window produces byte-identical batches and the ingest stays idempotent.
  trades.sort((a, b) => a.mt5_ticket - b.mt5_ticket);
  unpaired.sort((a, b) => a - b);
  return { trades, unpaired, malformed };
}
