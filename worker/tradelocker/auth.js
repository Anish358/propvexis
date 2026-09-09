// Turning a stored password into a bearer token, and keeping it fresh for one job.
//
// THE JWT LASTS ROUGHLY AN HOUR. The unattended cadence is three hours
// (queue.js SYNC_INTERVAL_MS), so a token is never carried across jobs -- the
// worker authenticates fresh at the start of every job instead. That is simpler
// than caching-and-refreshing across a process's lifetime, and the rate cost is
// one request per job (design spec §8).
//
// refresh() exists for the one case a fresh-per-job token cannot cover: a
// backfill that runs long enough for its OWN token to expire mid-job. The
// caller's fallback is `login()` again from the stored password -- the one
// advantage of holding a password rather than a token pair, spec §8 notes: a
// TradeLocker connection cannot be permanently lost the way a cTrader refresh
// rotation can be.

import { TRADELOCKER_HOSTS } from '../../src/domain/sync/connectors/tradelocker/index.js';
import { tlRequest } from './http.js';

const hostFor = (isLive) => (isLive ? TRADELOCKER_HOSTS.live : TRADELOCKER_HOSTS.demo);

/**
 * POST /auth/jwt/token on the resolved host.
 *
 * `isLive` decides WHICH host, never probed here -- Ruling B's demo-then-live
 * fallback is the CALLER's job (worker/tradelocker/index.js), because only the
 * caller knows whether this is the account's first job (host unknown) or a
 * later one (host already decided and stored). This function just tries one
 * host and throws with `.status` set when it fails, so the caller can tell a
 * wrong host (401) apart from anything else.
 */
export async function login({ email, password, server, isLive, fetchImpl = fetch }) {
  const body = await tlRequest(hostFor(isLive), 'auth/jwt/token', {
    method: 'POST',
    body: { email, password, server },
    fetchImpl,
  });
  return { accessToken: body?.accessToken ?? null, refreshToken: body?.refreshToken ?? null };
}

/** POST /auth/jwt/refresh. On failure the caller falls back to login() again. */
export async function refresh({ refreshToken, isLive, fetchImpl = fetch }) {
  const body = await tlRequest(hostFor(isLive), 'auth/jwt/refresh', {
    method: 'POST',
    body: { refreshToken },
    fetchImpl,
  });
  return { accessToken: body?.accessToken ?? null, refreshToken: body?.refreshToken ?? null };
}
