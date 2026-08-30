import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signState, verifyState, grantUrl, parseTokenResponse, ctraderEnabled,
  STATE_TTL_MS, CTRADER_SCOPE,
} from '../src/domain/sync/ctraderOauth.js';

const secret = 'test-session-secret';

// --- state: the CSRF guard --------------------------------------------------

test('a signed state verifies back to its user', () => {
  assert.equal(verifyState(signState(42, secret, 1000), secret, 1000).userId, 42);
});

test('a tampered or forged state is rejected', () => {
  // WITHOUT THIS the callback attaches an ATTACKER's cTrader identity to a
  // VICTIM's account, and every account the victim imports is the attacker's to
  // watch.
  const s = signState(42, secret, 1000);
  assert.equal(verifyState(s.replace(/^42/, '43'), secret, 1000), null, 'user id swap');
  assert.equal(verifyState(s, 'a-different-secret', 1000), null, 'forged signature');
  assert.equal(verifyState('garbage', secret, 1000), null);
  assert.equal(verifyState('', secret, 1000), null);
  assert.equal(verifyState(undefined, secret, 1000), null);
});

test('a state expires', () => {
  const s = signState(42, secret, 1000);
  assert.ok(verifyState(s, secret, 1000 + STATE_TTL_MS - 1));
  assert.equal(verifyState(s, secret, 1000 + STATE_TTL_MS + 1), null);
});

test('the state TTL does not wildly outlive cTrader own 60-second auth code', () => {
  assert.ok(STATE_TTL_MS <= 15 * 60 * 1000);
});

// --- the grant URL ----------------------------------------------------------

test('the grant URL requests view-only scope and nothing more', () => {
  const u = new URL(grantUrl({
    clientId: 'cid', redirectUri: 'https://app.propvexis.com/api/ctrader/callback', state: 'st',
  }));
  assert.equal(u.origin + u.pathname, 'https://id.ctrader.com/my/settings/openapi/grantingaccess/');
  assert.equal(u.searchParams.get('scope'), 'accounts');
  assert.equal(u.searchParams.get('client_id'), 'cid');
  assert.equal(u.searchParams.get('state'), 'st');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://app.propvexis.com/api/ctrader/callback');
});

test('POLICY PIN: trading scope is never requested, from anywhere', () => {
  // The read-only promise for this platform IS the scope. If this ever needs to
  // change it is a product decision with a user-facing consequence, not a tweak.
  assert.equal(CTRADER_SCOPE, 'accounts');
  assert.doesNotMatch(grantUrl({ clientId: 'c', redirectUri: 'r', state: 's' }), /trading/);
});

// --- token responses --------------------------------------------------------

test('both camelCase and snake_case token responses parse', () => {
  const a = parseTokenResponse({ accessToken: 'a', refreshToken: 'r', expiresIn: 100 }, 0);
  const b = parseTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 100 }, 0);
  assert.equal(a.accessToken, 'a');
  assert.equal(b.refreshToken, 'r');
  assert.deepEqual(a.expiresAt, new Date(100_000));
});

test('a missing expiry falls back to 30 days, never to now', () => {
  // Falling back to now() marks a perfectly good token as already expired and
  // sends the worker into a refresh loop on its very first use — which, because
  // refresh consumes the token, burns the grant.
  const t = parseTokenResponse({ accessToken: 'a', refreshToken: 'r' }, 0);
  assert.equal(t.expiresAt.getTime(), 2_628_000 * 1000);
});

test('an error response throws rather than yielding empty tokens', () => {
  assert.throws(() => parseTokenResponse({ errorCode: 'INVALID_REQUEST' }, 0), /INVALID_REQUEST/);
  assert.throws(() => parseTokenResponse({}, 0));
});

// --- gating -----------------------------------------------------------------

test('ctraderEnabled needs all three settings, not just a client id', () => {
  assert.equal(ctraderEnabled({ ctraderClientId: 'c', ctraderClientSecret: 's', ctraderRedirectUri: 'r' }), true);
  assert.equal(ctraderEnabled({ ctraderClientId: 'c', ctraderClientSecret: 's', ctraderRedirectUri: '' }), false);
  assert.equal(ctraderEnabled({ ctraderClientId: '', ctraderClientSecret: '', ctraderRedirectUri: '' }), false);
});
