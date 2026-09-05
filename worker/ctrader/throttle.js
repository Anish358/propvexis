// The historical-request throttle.
//
// LANDMINE 10.6: cTrader allows 50 requests/second in general but only 5/second
// for HISTORICAL data, and a backfill written against the general limit earns
// 429s from its first window. The limit is also PER CONNECTION, so it has to be
// enforced across every account sharing a socket -- firing five accounts in
// parallel, each politely at "5/s", is 25/s on one connection.

export class HistoricalThrottle {
  constructor({ limitPerSecond = 5, now = Date.now } = {}) {
    this.limitPerSecond = limitPerSecond;
    this.now = now;
    this.spacingMs = 1000 / limitPerSecond;
    this.nextFree = 0;
    this.blockedUntil = 0;
  }

  /**
   * The server told us to back off, and it outranks our own spacing.
   *
   * `retryAfter` on a BLOCKED_PAYLOAD_TYPE error is authoritative: our 5/s is a
   * guess at a documented number, and the server's answer is the number.
   */
  blockUntil(timestamp) {
    this.blockedUntil = Math.max(this.blockedUntil, Number(timestamp) || 0);
  }

  /** Reserve the next slot and return the epoch-ms it may be used at. */
  nextSlotAt() {
    const t = this.now();
    const at = Math.max(t, this.nextFree, this.blockedUntil);
    this.nextFree = at + this.spacingMs;
    return at;
  }

  /** Resolve when the next slot is due. */
  async take(sleep = (ms) => new Promise((r) => { setTimeout(r, ms); })) {
    const at = this.nextSlotAt();
    const wait = at - this.now();
    if (wait > 0) await sleep(wait);
    return at;
  }
}
