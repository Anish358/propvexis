// Where a backfill looks, and in what order.
//
// NEWEST FIRST. The user is never blocked on this: the wizard finishes the moment
// the account is provisioned, and the backfill is a job. So the budget that
// matters is TIME UNTIL THE FIRST TRADES ARE VISIBLE, not total duration. Walking
// oldest-first would leave a new user staring at an empty journal while four
// years of 2022 filled in ahead of the trades they actually remember taking.
//
// Nothing caps the span of a deal-list request. The one-week validation
// (toTimestamp - fromTimestamp <= 604800000) is on ProtoOACashFlowHistoryListReq,
// NOT on ProtoOADealListReq -- verified directly against OpenApiMessages.proto,
// where DealListReq's only bound is 19 Jan 2038. The 30-day window is ours, to
// keep each response and each retry small, not the protocol's.

const DAY = 24 * 60 * 60 * 1000;

export const WINDOW_MS = 30 * DAY;

/**
 * A hard ceiling on how many windows one backfill will walk.
 *
 * ProtoOATraderReq gives registrationTimestamp, which is the real floor. But if
 * it is missing we must not walk to 1970 a month at a time -- that is 600+
 * historical requests at 5/s, roughly two minutes of solid rate-limited traffic
 * on a shared socket, for an account we know nothing about. Ten years is longer
 * than retail broker retention and far longer than any prop account lives.
 */
export const MAX_WINDOWS = 122;

/**
 * The windows to walk, newest first.
 *
 * @param {number} now           epoch ms
 * @param {number|null} registeredAt  account inception, the floor
 * @param {number|null} cursorAt      resume point from sync_jobs.cursor_at
 */
export function backfillWindows({ now, registeredAt = null, cursorAt = null }) {
  // A resumed backfill starts where it stopped, not at now: without this a worker
  // killed mid-backfill re-walks everything it already has to arrive back where
  // it was.
  const top = Number.isFinite(Number(cursorAt)) && cursorAt ? Number(cursorAt) : Number(now);
  const floor = Number.isFinite(Number(registeredAt)) && registeredAt
    ? Number(registeredAt)
    : top - MAX_WINDOWS * WINDOW_MS;

  const windows = [];
  let to = top;
  while (to > floor && windows.length < MAX_WINDOWS) {
    const from = Math.max(to - WINDOW_MS, floor);
    windows.push({ from, to });
    to = from;
  }
  return windows;
}

/**
 * Where to resume paging inside a window, given the last deal seen.
 *
 * DELIBERATELY NOT `last + 1`. Two deals can share an executionTimestamp, and a
 * +1ms bump skips the second one silently and permanently -- the worst class of
 * bug this connector can have, because the journal looks complete. Re-reading the
 * boundary costs nothing: dealId is the idempotency key at ingest, so the
 * overlapping deal is a no-op.
 */
export const advanceCursor = (lastExecutionTimestamp) => Number(lastExecutionTimestamp);
