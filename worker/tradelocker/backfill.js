// One account's history, newest first -- the REST equivalent of
// worker/ctrader/backfill.js. Same windowed-walk shape (imported from
// ../ctrader/windows.js rather than duplicated: the walk is pure date math with
// nothing cTrader-specific in it), different wire format underneath: HTTP and
// JSON instead of a protobuf socket, and orders that must be PAIRED into trades
// rather than closed deals handed to us directly (design spec §6).

import { splitBatch } from '../../src/domain/trades/batch.js';
import { num, str } from '../../src/domain/sync/connectors/tradelocker/columns.js';
import { pairOrders } from '../../src/domain/sync/connectors/tradelocker/pairing.js';
import { backfillWindows, advanceCursor } from '../ctrader/windows.js';
import { tlRequest } from './http.js';

const MAX_PAGES_PER_WINDOW = 200;

// Same reasoning as pairing.js's roundMoney: summing already-rounded cents with
// plain `+=` still accumulates binary-float residue across enough trades, and
// that residue is exactly what reconcile.js compares against the broker's own
// figure. Round the running total, not just each trade.
const roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The account's deposit currency (design spec §6.1 -- computeMoney refuses to
 * price a trade whose quote currency does not match it).
 *
 * GET /trade/accounts returns every account this login can see; the one this
 * job is about is picked out by id, since the route carries no filter.
 */
export async function fetchAccountCurrency({ host, token, accNum, accountId, fetchImpl = fetch }) {
  const res = await tlRequest(host, 'trade/accounts', { token, accNum, fetchImpl });
  const list = Array.isArray(res?.d) ? res.d : [];
  const row = list.find((a) => String(a.id) === String(accountId));
  return str(row?.currency) ?? null;
}

/**
 * Every instrument this account can see, with the ROUTE id instrumentDetails
 * needs. TradeLocker splits "which instruments exist" from "what are this
 * instrument's contract terms" across two endpoints; this is the first one,
 * fetched once per job and cached in-memory by the caller for the rest of it.
 *
 * routeId PREFERS 'TRADE' -- lotSize/tick size are trading conditions, not
 * quote data, and TradeLocker's own docs split routes into TRADE (trading
 * operations) vs INFO (quotes/history). Falls back to whatever route exists
 * rather than skipping the instrument outright: a wrong-but-present route still
 * lets computeMoney refuse cleanly (contractSize null) instead of the trade
 * being dropped from the journal entirely.
 */
export async function fetchInstrumentsList({ host, token, accNum, accountId, fetchImpl = fetch }) {
  const res = await tlRequest(host, `trade/accounts/${accountId}/instruments`, { token, accNum, fetchImpl });
  const list = Array.isArray(res?.d?.instruments) ? res.d.instruments : [];
  const out = new Map();
  for (const i of list) {
    const id = Number(i.tradableInstrumentId);
    if (!Number.isFinite(id)) continue;
    const routes = Array.isArray(i.routes) ? i.routes : [];
    const routeId = routes.find((r) => r.type === 'TRADE')?.id
      ?? routes.find((r) => r.type === 'INFO')?.id
      ?? routes[0]?.id
      ?? null;
    out.set(id, { name: str(i.name), routeId });
  }
  return out;
}

/**
 * One instrument's contract terms: GET /trade/instruments/{id}?routeId=.
 *
 * Returns null for an instrument we could not resolve a route for -- NEVER
 * throws. Same reasoning as ctrader/backfill.js's fetchAssets: this is
 * metadata a trade's money math can refuse to compute without (pairing.js
 * writes pnl_money NULL when contractSize is missing), not a reason to fail a
 * job that would otherwise import the trade correctly.
 */
export async function fetchInstrumentDetails({
  host, token, accNum, tradableInstrumentId, routeId, fetchImpl = fetch, log = console,
}) {
  if (routeId == null) return null;
  try {
    const res = await tlRequest(
      host, `trade/instruments/${tradableInstrumentId}?routeId=${routeId}`, { token, accNum, fetchImpl },
    );
    const d = res?.d ?? {};
    return {
      contractSize: num(d.lotSize),
      // TradeLocker names this `quotingCurrency`; pairing.js's computeMoney
      // reads `instrument.quoteCurrency` -- renamed at the boundary rather than
      // inside the pure connector module, which knows nothing of TradeLocker's
      // wire field names by design (columns.js is the only place allowed to).
      quoteCurrency: str(d.quotingCurrency),
    };
  } catch (err) {
    log.info?.({ tradableInstrumentId, err: err.message }, 'tradelocker instrument details unavailable');
    return null;
  }
}

/**
 * One window, fully paged. `hasMore` re-queries from the newest `createdDate`
 * seen in the page -- NOT +1ms, for the identical reason ctrader/backfill.js's
 * fetchWindow re-reads its boundary: two orders can share a millisecond, and a
 * +1 bump would skip the second one silently and permanently. Re-reading it
 * costs nothing because mt5_ticket (the closing order id) is the idempotency
 * key at ingest.
 */
export async function fetchOrdersHistoryWindow({
  host, token, accNum, accountId, resolver, from, to, fetchImpl = fetch,
}) {
  const rows = [];
  let cursor = from;
  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page += 1) {
    const res = await tlRequest(
      host,
      `trade/accounts/${accountId}/ordersHistory?from=${cursor}&to=${to}`,
      { token, accNum, fetchImpl },
    );
    const batch = Array.isArray(res?.d?.ordersHistory) ? res.d.ordersHistory : [];
    rows.push(...batch);
    if (res?.d?.hasMore !== true || !batch.length) break;
    const seen = batch.map((r) => num(resolver.get(r, 'createdDate'))).filter((n) => n != null);
    if (!seen.length) break;
    const next = advanceCursor(Math.max(...seen));
    if (next <= cursor) break;    // no progress: stop rather than spin
    cursor = next;
  }
  return rows;
}

/**
 * Positional ordersHistory rows -> journal trades, one instrument at a time.
 *
 * pairOrders TAKES EXACTLY ONE `instrument` PER CALL (pairing.js), so a
 * window's rows -- which cover every instrument the account traded in that
 * window -- must be split by tradableInstrumentId before pairing, or a EURUSD
 * fill would be priced with a GBPJPY's contract size. Grouping happens on ALL
 * rows regardless of status; pairOrders already filters to Filled internally.
 *
 * Returns the trades AND the sum of their non-NULL pnl_money -- reconcile.js's
 * input, and NULL is an honest abstention here too: a window where every trade
 * priced to NULL must not silently read as a $0 window.
 */
export function ordersToTrades({ rows, resolver, instrumentsById, bandedLogin }) {
  const byInstrument = new Map();
  for (const row of rows) {
    const id = num(resolver.get(row, 'tradableInstrumentId'));
    if (id == null) continue;
    if (!byInstrument.has(id)) byInstrument.set(id, []);
    byInstrument.get(id).push(row);
  }

  const trades = [];
  const unpaired = [];
  const malformed = [];
  let pnlSum = 0;
  let pnlCount = 0;

  for (const [id, group] of byInstrument) {
    const meta = instrumentsById.get(id) ?? {};
    const result = pairOrders({
      rows: group,
      resolver,
      instrument: {
        symbol: meta.name ?? null,
        contractSize: meta.contractSize ?? null,
        quoteCurrency: meta.quoteCurrency ?? null,
        depositCurrency: meta.depositCurrency ?? null,
      },
      bandedLogin,
    });
    trades.push(...result.trades);
    unpaired.push(...result.unpaired);
    malformed.push(...result.malformed);
    for (const t of result.trades) {
      if (t.pnl_money != null) { pnlSum += t.pnl_money; pnlCount += 1; }
    }
  }

  trades.sort((a, b) => a.mt5_ticket - b.mt5_ticket);
  return { trades, unpaired, malformed, pnlSum: roundMoney(pnlSum), pnlCount };
}

/**
 * Walk an account's history and post it, exactly the shape
 * ctrader/backfill.js's backfillAccount has: newest-first windows, an
 * `onWindow` checkpoint hook for sync_jobs.cursor_at, two consecutive empty
 * windows ending a backfill with no registeredAt-equivalent floor to stop at
 * otherwise (design spec §8 -- TradeLocker offers nothing like cTrader's
 * registrationTimestamp).
 */
export async function backfillAccount({
  host, token, accNum, accountId, resolver, api, job, bandedLogin,
  now = Date.now, onWindow = async () => {}, log = console, fetchImpl = fetch,
}) {
  const depositCurrency = await fetchAccountCurrency({ host, token, accNum, accountId, fetchImpl });
  const instrumentRoutes = await fetchInstrumentsList({ host, token, accNum, accountId, fetchImpl });
  // Contract terms are fetched lazily, per instrument actually traded, and
  // cached for the rest of THIS job -- an account that only ever traded EURUSD
  // and GBPJPY should cost two instrumentDetails requests, not one per symbol
  // TradeLocker happens to list.
  const detailsCache = new Map();
  const instrumentsById = new Map();
  const detailsFor = async (id) => {
    if (detailsCache.has(id)) return detailsCache.get(id);
    const route = instrumentRoutes.get(id);
    const details = await fetchInstrumentDetails({
      host, token, accNum, tradableInstrumentId: id, routeId: route?.routeId ?? null, fetchImpl, log,
    });
    const meta = { name: route?.name ?? null, ...details, depositCurrency };
    detailsCache.set(id, meta);
    instrumentsById.set(id, meta);
    return meta;
  };

  const windows = backfillWindows({
    now: now(),
    registeredAt: null,
    cursorAt: job.cursor_at ? new Date(job.cursor_at).getTime() : null,
  });

  let posted = 0;
  let pnlSum = 0;
  let pnlCount = 0;
  let emptyRun = 0;

  for (const w of windows) {
    const rows = await fetchOrdersHistoryWindow({
      host, token, accNum, accountId, resolver, from: w.from, to: w.to, fetchImpl,
    });
    if (!rows.length) {
      emptyRun += 1;
      await onWindow(w);
      if (emptyRun >= 2) break;
      continue;
    }
    emptyRun = 0;

    // Resolve (and cache) every instrument this window touched BEFORE pairing,
    // so ordersToTrades never has to await mid-loop.
    const ids = new Set();
    for (const row of rows) {
      const id = num(resolver.get(row, 'tradableInstrumentId'));
      if (id != null) ids.add(id);
    }
    for (const id of ids) await detailsFor(id);

    const { trades, pnlSum: windowPnl, pnlCount: windowCount } =
      ordersToTrades({ rows, resolver, instrumentsById, bandedLogin });
    for (const chunk of splitBatch(trades)) {
      if (!chunk.length) continue;
      await api.ingest(job.ingest_token, chunk);
      posted += chunk.length;
    }
    pnlSum += windowPnl;
    pnlCount += windowCount;
    await onWindow(w);
    log.info?.({ account: job.account_id, from: w.from, to: w.to, posted }, 'tradelocker window done');
  }

  return { posted, windows: windows.length, pnlSum: roundMoney(pnlSum), pnlCount, depositCurrency };
}
