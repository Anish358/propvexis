// Trade replay candles: M1 bars stored per normalized symbol, and the request
// queue the EA works through to supply them (see db/migrations/0010_candles.sql
// for the flow). All times are UTC; the EA converts broker time before sending.
import { query } from './db.js';

// Replay window padding: context shown before entry / after exit. Shared by
// the ingest-time enqueue and /replay so both derive the identical window
// (candle_requests dedups on it). PAD_BEFORE is 2 days so the chart carries
// enough prior market structure to scroll back through; playback still starts
// near the entry (the frontend frames + starts the cursor there).
export const PAD_BEFORE_MIN = 2 * 24 * 60; // 2 days
export const PAD_AFTER_MIN = 60;

// A request the EA keeps returning nothing for (symbol gone, M1 history not on
// the broker) is failed after this many hand-outs so /replay stops reporting
// pending. ~1h of active polling at the EA's 15s retry cadence.
const MAX_ATTEMPTS = 240;

export function replayWindow(trade) {
  const from = new Date(new Date(trade.open_time).getTime() - PAD_BEFORE_MIN * 60_000);
  const to = new Date(new Date(trade.close_time).getTime() + PAD_AFTER_MIN * 60_000);
  return { from, to };
}

// Queue the trade's replay window for its account's EA. Idempotent: the window
// is derived from the trade's times, so resends hit the UNIQUE key and no-op.
export async function enqueueCandleRequest(trade) {
  if (trade.account_id == null || trade.symbol_base == null) return;
  const { from, to } = replayWindow(trade);
  await query(
    `INSERT INTO candle_requests (account_id, symbol, symbol_base, from_time, to_time)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, symbol_base, from_time, to_time) DO NOTHING;`,
    [trade.account_id, trade.symbol, trade.symbol_base, from.toISOString(), to.toISOString()]
  );
}

// Hand the EA its pending requests (only windows fully in the past — the
// after-exit padding must exist before CopyRates can cover it). Each hand-out
// bumps attempts; requests past the cap are failed first so they stop cycling.
export async function pendingRequestsForLogin(login, limit = 5) {
  await query(
    `UPDATE candle_requests SET status = 'failed'
      WHERE account_id = $1 AND status = 'pending' AND attempts >= $2;`,
    [login, MAX_ATTEMPTS]
  );
  // Hand out any pending request whose window has started (from_time is always
  // past for a closed trade). The to_time is CLAMPED to now(): if the after-exit
  // padding is still in the future (a freshly-closed trade), the EA gets bars up
  // to the present instead of the request sitting idle for ~an hour. Older trades
  // whose full window is already past return their full to_time unchanged.
  const { rows } = await query(
    `UPDATE candle_requests SET attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM candle_requests
         WHERE account_id = $1 AND status = 'pending' AND from_time <= now()
         ORDER BY id
         LIMIT $2)
      RETURNING id, symbol,
                EXTRACT(EPOCH FROM from_time)::float8            AS from_epoch,
                EXTRACT(EPOCH FROM LEAST(to_time, now()))::float8 AS to_epoch;`,
    [login, limit]
  );
  return rows;
}

export async function markRequestDone(id, login) {
  await query(
    `UPDATE candle_requests SET status = 'done' WHERE id = $1 AND account_id = $2;`,
    [id, login]
  );
}

// Batch-upsert bars sent by the EA: arrays of [epoch_sec, open, high, low, close].
export async function upsertCandles(symbolBase, bars) {
  if (!bars.length) return 0;
  const params = [symbolBase];
  const rows = bars.map((b) => {
    params.push(new Date(b[0] * 1000).toISOString(), b[1], b[2], b[3], b[4]);
    const p = params.length;
    return `($1, $${p - 4}::timestamptz, $${p - 3}, $${p - 2}, $${p - 1}, $${p})`;
  });
  await query(
    `INSERT INTO candles (symbol_base, ts, open, high, low, close)
     VALUES ${rows.join(', ')}
     ON CONFLICT (symbol_base, ts) DO UPDATE SET
       open = EXCLUDED.open, high = EXCLUDED.high,
       low = EXCLUDED.low, close = EXCLUDED.close;`,
    params
  );
  return bars.length;
}

// Bars for a replay window, shaped for the chart: t is UTC epoch seconds
// (what lightweight-charts consumes directly).
export async function listCandles(symbolBase, from, to) {
  const { rows } = await query(
    `SELECT EXTRACT(EPOCH FROM ts)::float8 AS t, open AS o, high AS h, low AS l, close AS c
       FROM candles
      WHERE symbol_base = $1 AND ts >= $2 AND ts <= $3
      ORDER BY ts ASC;`,
    [symbolBase, from.toISOString(), to.toISOString()]
  );
  return rows;
}

// Is a request for this exact window still in flight? ('pending' → the EA will
// deliver; 'failed'/'done'-with-gaps → the frontend shows what we have.)
export async function windowRequestStatus(trade) {
  if (trade.account_id == null) return null;
  const { from, to } = replayWindow(trade);
  const { rows } = await query(
    `SELECT status FROM candle_requests
      WHERE account_id = $1 AND symbol_base = $2 AND from_time = $3 AND to_time = $4;`,
    [trade.account_id, trade.symbol_base, from.toISOString(), to.toISOString()]
  );
  return rows[0]?.status ?? null;
}
