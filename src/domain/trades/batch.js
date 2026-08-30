// How many trades one ingest request carries, and how a long backfill is cut
// into requests.
//
// 500 is chosen against the BODY, not the row count: a trade serializes to
// roughly 500 bytes of JSON, so a full batch is ~250KB — comfortably inside the
// route's 12MB limit with room for a fatter trade shape later.
//
// WHY THIS EXISTS. The MT5 agent posts one trade per HTTP request
// (agent/api.py, post_trade). That is fine for a 48-hour window and ruinous for
// a cTrader backfill: an account with four years of history is ~20,000 trades,
// and 20,000 sequential POSTs against our own API on a 1GB box is not a sync,
// it is an outage.

export const BATCH_LIMIT = 500;

/** Cut a run of trades into request-sized chunks. Empty in, empty out. */
export function splitBatch(trades, limit = BATCH_LIMIT) {
  const out = [];
  for (let i = 0; i < trades.length; i += limit) out.push(trades.slice(i, i + limit));
  return out;
}
