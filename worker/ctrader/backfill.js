// One account's history, newest first.
//
// Nothing caps the span of ProtoOADealListReq -- the one-week validation lives on
// ProtoOACashFlowHistoryListReq, not here (verified in OpenApiMessages.proto).
// The 30-day window is ours, to keep each response and each retry small.

import { splitBatch } from '../../src/domain/trades/batch.js';
import { ctraderConnector } from '../../src/domain/sync/connectors/ctrader.js';
import { backfillWindows, advanceCursor } from './windows.js';

const PAGE_ROWS = 1000;

/** registrationTimestamp is the true floor for historical requests. */
export async function fetchTrader({ conn, ctid }) {
  const res = await conn.request('ProtoOATraderReq', { ctidTraderAccountId: ctid });
  return res?.trader ?? null;
}

/**
 * Symbol names and lot sizes for the symbols actually traded.
 *
 * TWO REQUESTS, DELIBERATELY. ProtoOALightSymbol (the list) carries symbolName but
 * NOT lotSize; lotSize is only on the full ProtoOASymbol, fetched by id. Volume
 * and lotSize are both in CENTS, so lotSize is what makes a deal's volume mean
 * lots -- getting it wrong is a silent 100x on every position size.
 */
export async function fetchSymbols({ conn, ctid, symbolIds }) {
  const out = new Map();
  if (!symbolIds.length) return out;
  const list = await conn.request('ProtoOASymbolsListReq',
    { ctidTraderAccountId: ctid, includeArchivedSymbols: true });
  for (const s of list?.symbol ?? []) {
    if (symbolIds.includes(Number(s.symbolId))) {
      out.set(Number(s.symbolId), { symbolName: s.symbolName ?? null, lotSize: null });
    }
  }
  const full = await conn.request('ProtoOASymbolByIdReq',
    { ctidTraderAccountId: ctid, symbolId: symbolIds });
  for (const s of full?.symbol ?? []) {
    const prev = out.get(Number(s.symbolId)) ?? { symbolName: null, lotSize: null };
    out.set(Number(s.symbolId), { ...prev, lotSize: s.lotSize == null ? null : Number(s.lotSize) });
  }
  return out;
}

/** One window's deals, paging forward on hasMore. */
export async function fetchWindow({ conn, ctid, from, to, throttle }) {
  const deals = [];
  let cursor = from;
  for (let page = 0; page < 200; page += 1) {
    await throttle.take();
    const res = await conn.request('ProtoOADealListReq', {
      ctidTraderAccountId: ctid, fromTimestamp: cursor, toTimestamp: to, maxRows: PAGE_ROWS,
    });
    const batch = res?.deal ?? [];
    deals.push(...batch);
    if (!res?.hasMore || !batch.length) break;
    const last = Math.max(...batch.map((d) => Number(d.executionTimestamp)));
    // NOT last + 1. Two deals can share a millisecond and the bump skips the
    // second, silently and permanently. Re-reading the boundary is free because
    // dealId is the idempotency key at ingest.
    const next = advanceCursor(last);
    if (next <= cursor) break;      // no progress: stop rather than spin
    cursor = next;
  }
  return deals;
}

/**
 * Turn a window's deals into journal rows.
 *
 * ONE ROW PER CLOSING DEAL. A partial close emits several closing deals against
 * one positionId, and keying on the position would make each one rewrite the last.
 * Direction comes from the OPENING deal, because a long is closed by a sell and
 * reading the closing side would invert every trade in the journal.
 */
export function dealsToTrades({ deals, symbols, bandedLogin }) {
  const openByPosition = new Map();
  // Oldest first, so the opener for a position is seen before its closers.
  const ordered = [...deals].sort(
    (a, b) => Number(a.executionTimestamp) - Number(b.executionTimestamp),
  );
  const trades = [];
  for (const deal of ordered) {
    const pos = String(deal.positionId);
    if (!ctraderConnector.isClosingDeal(deal)) {
      if (!openByPosition.has(pos)) openByPosition.set(pos, deal);
      continue;
    }
    const sym = symbols.get(Number(deal.symbolId)) ?? { symbolName: null, lotSize: null };
    trades.push(ctraderConnector.dealToTrade({
      deal,
      openDeal: openByPosition.get(pos) ?? null,
      symbolName: sym.symbolName,
      lotSize: sym.lotSize,
      bandedLogin,
    }));
  }
  return trades;
}

/**
 * Walk an account's history and post it.
 *
 * `onWindow` is called after each window so the caller can checkpoint
 * sync_jobs.cursor_at -- a worker killed mid-backfill resumes instead of
 * re-walking years to arrive back where it was.
 */
export async function backfillAccount({
  conn, api, job, throttle, now = Date.now, onWindow = async () => {}, log = console,
}) {
  const ctid = Number(job.ctid_trader_account_id);
  const trader = await fetchTrader({ conn, ctid });
  const registeredAt = trader?.registrationTimestamp == null
    ? null : Number(trader.registrationTimestamp);

  const windows = backfillWindows({
    now: now(),
    registeredAt,
    cursorAt: job.cursor_at ? new Date(job.cursor_at).getTime() : null,
  });

  let posted = 0;
  let emptyRun = 0;
  for (const w of windows) {
    const deals = await fetchWindow({ conn, ctid, from: w.from, to: w.to, throttle });
    if (!deals.length) {
      emptyRun += 1;
      await onWindow(w);
      // Two consecutive empty windows end it. One is not enough -- a trader can
      // easily take no trades for a month.
      if (emptyRun >= 2 && registeredAt == null) break;
      continue;
    }
    emptyRun = 0;
    const symbolIds = [...new Set(deals.map((d) => Number(d.symbolId)))];
    const symbols = await fetchSymbols({ conn, ctid, symbolIds });
    const trades = dealsToTrades({ deals, symbols, bandedLogin: job.login });
    for (const chunk of splitBatch(trades)) {
      if (!chunk.length) continue;
      await api.ingest(job.ingest_token, chunk);
      posted += chunk.length;
    }
    await onWindow(w);
    log.info?.({ account: job.account_id, from: w.from, to: w.to, posted }, 'ctrader window done');
  }
  return { posted, windows: windows.length };
}
