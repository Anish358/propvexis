import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../platform/config.js';

// cTrader's OAuth 2.0 half: the grant URL, the CSRF state, and the two token
// calls. Everything except the two fetches is pure, so the security-critical part
// is unit-tested without a network.
//
// SCOPE IS ALWAYS 'accounts' -- view only. This is the whole read-only story for
// this platform, and it is a stronger one than the MT5 farm's: there, we ask for
// an investor password and delete the credential if the terminal reports it can
// trade, which is a check we perform. Here Spotware refuses trading operations on
// our behalf. There is deliberately no configuration that requests 'trading'.

export const CTRADER_SCOPE = 'accounts';
export const AUTHORIZE_URL = 'https://id.ctrader.com/my/settings/openapi/grantingaccess/';
export const TOKEN_URL = 'https://openapi.ctrader.com/apps/token';

/**
 * How long a `state` is good for.
 *
 * Ten minutes, not thirty: it only has to survive the user reading a consent
 * screen. cTrader's own authorization CODE expires after sixty seconds, so a
 * state that outlived the code by much would only widen the replay window
 * without ever being useful.
 */
export const STATE_TTL_MS = 10 * 60 * 1000;

/** True when the app is registered and configured. Unset means the routes 503. */
export const ctraderEnabled = (cfg = config) =>
  Boolean(cfg.ctraderClientId && cfg.ctraderClientSecret && cfg.ctraderRedirectUri);

const mac = (payload, secret) =>
  createHmac('sha256', String(secret)).update(payload).digest('base64url');

/**
 * A signed, expiring, user-bound `state`.
 *
 * WITHOUT THIS THE CALLBACK IS A CSRF HOLE. An attacker who can make a victim's
 * browser hit the callback with the attacker's own authorization code attaches
 * the ATTACKER's cTrader identity to the VICTIM's PropVexis account -- and every
 * account the victim then imports is the attacker's to watch. The user id must
 * come from here and from nowhere else in the request.
 */
export function signState(userId, secret, now = Date.now()) {
  const payload = `${Number(userId)}.${now + STATE_TTL_MS}`;
  return `${payload}.${mac(payload, secret)}`;
}

/** The user id a state proves, or null. Never throws — a bad state is a 400, not a 500. */
export function verifyState(state, secret, now = Date.now()) {
  const parts = String(state ?? '').split('.');
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  const want = Buffer.from(mac(`${uid}.${exp}`, secret), 'utf8');
  const got = Buffer.from(sig, 'utf8');
  // Length first: timingSafeEqual throws on a mismatch, and the length of a MAC
  // is not a secret.
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  if (!Number.isFinite(Number(exp)) || Number(exp) < now) return null;
  const userId = Number(uid);
  return Number.isInteger(userId) && userId > 0 ? { userId } : null;
}

/** Where to send the user to consent. */
export function grantUrl({ clientId, redirectUri, state }) {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', CTRADER_SCOPE);
  u.searchParams.set('state', state);
  // 'web' asks cTrader for the mobile-optimized consent screen; harmless on desktop.
  u.searchParams.set('product', 'web');
  return u.toString();
}

/** Normalize either token response into what the identity store stores. */
export function parseTokenResponse(body, now = Date.now()) {
  const at = body?.accessToken ?? body?.access_token;
  const rt = body?.refreshToken ?? body?.refresh_token;
  const ttl = Number(body?.expiresIn ?? body?.expires_in ?? 0);
  if (!at || !rt) throw new Error(body?.errorCode ?? body?.error ?? 'cTrader returned no tokens');
  return {
    accessToken: String(at),
    refreshToken: String(rt),
    // Fall back to 30 days -- the documented access-token lifetime -- rather than
    // to now(), which would mark a perfectly good token as already expired and
    // send the worker into a refresh loop on its first use.
    expiresAt: new Date(now + (ttl > 0 ? ttl * 1000 : 2_628_000 * 1000)),
  };
}

const tokenCall = async (params, fetchImpl = fetch) => {
  const u = new URL(TOKEN_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetchImpl(u.toString(), { method: 'GET' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.errorCode ?? `cTrader token endpoint returned ${res.status}`);
  return parseTokenResponse(body);
};

/**
 * Exchange an authorization code. THE CODE LIVES SIXTY SECONDS, so the caller
 * must run this first and defer every other piece of work in the callback.
 */
export const exchangeCode = ({ code, cfg = config, fetchImpl = fetch }) =>
  tokenCall({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.ctraderRedirectUri,
    client_id: cfg.ctraderClientId,
    client_secret: cfg.ctraderClientSecret,
  }, fetchImpl);

/**
 * Refresh. The supplied refresh token is CONSUMED by this call -- the pair that
 * comes back is the only one that then works, so the caller must persist both in
 * one statement (see rotateTokensQuery).
 */
export const refreshTokens = ({ refreshToken, cfg = config, fetchImpl = fetch }) =>
  tokenCall({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: cfg.ctraderClientId,
    client_secret: cfg.ctraderClientSecret,
  }, fetchImpl);
