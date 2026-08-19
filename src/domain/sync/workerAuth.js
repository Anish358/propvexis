import { timingSafeEqual } from 'node:crypto';

/**
 * Does this Authorization header carry the sync worker's token?
 *
 * Pure and separate from the route so the two rules that matter are unit-tested:
 *
 * 1. FAIL CLOSED WHEN UNCONFIGURED. An empty SYNC_WORKER_TOKEN must never mean
 *    "accept an empty bearer" — that would open the lease endpoint, and with it
 *    every stored investor password, on any box where the value was forgotten.
 * 2. CONSTANT TIME. The comparison must not leak the token's prefix through
 *    timing, because unlike a user password this secret never rotates on its own.
 */
export function workerTokenMatches(header, expected) {
  if (!expected) return false;
  const given = Buffer.from(String(header ?? '').replace(/^Bearer\s+/i, ''), 'utf8');
  const want = Buffer.from(String(expected), 'utf8');
  // Length is compared first because timingSafeEqual throws on a mismatch. The
  // length of a secret is not the secret, so this leaks nothing useful.
  return given.length === want.length && timingSafeEqual(given, want);
}
