import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKey } from '../src/platform/secretbox.js';
import { credAad } from '../src/domain/sync/credentials.js';
import {
  identityAad, sealTokens, openTokens, identitiesEnabled,
  createIdentityQuery, rotateTokensQuery, identityForUserQuery, listIdentitiesQuery,
  revokeIdentityQuery, upsertDiscoveredQuery, discoveredForIdentityQuery,
} from '../src/domain/sync/ctraderIdentities.js';

const cfg = { syncCredKey: generateKey() };

// --- sealing ----------------------------------------------------------------

test('a token pair round-trips under an identity-bound AAD', () => {
  const sealed = sealTokens(7, { accessToken: 'at-1', refreshToken: 'rt-1' }, cfg);
  assert.deepEqual(openTokens({ id: 7, ...sealed }, cfg), { accessToken: 'at-1', refreshToken: 'rt-1' });
});

test('a ciphertext cannot be replayed into another identity', () => {
  const sealed = sealTokens(7, { accessToken: 'at-1', refreshToken: 'rt-1' }, cfg);
  assert.throws(() => openTokens({ id: 8, ...sealed }, cfg));
});

test('the cTrader AAD can never collide with an MT5 credential AAD', () => {
  // Both use SYNC_CRED_KEY. Without distinct prefixes a ciphertext moved between
  // the two tables would open cleanly and point one platform's login path at
  // another platform's secret.
  assert.equal(identityAad(7), 'ctrader-token:7');
  assert.notEqual(identityAad(7), credAad(7));
  assert.ok(!credAad(7).startsWith('ctrader-token:'));
});

test('sealing refuses an incomplete pair rather than storing half a grant', () => {
  assert.throws(() => sealTokens(1, { accessToken: 'a' }, cfg), /refreshToken/);
  assert.throws(() => sealTokens(1, { refreshToken: 'r' }, cfg), /accessToken/);
});

test('identitiesEnabled is false when no key is configured', () => {
  assert.equal(identitiesEnabled({ syncCredKey: '' }), false);
  assert.equal(identitiesEnabled(cfg), true);
});

// --- query builders ---------------------------------------------------------

test('a new identity is created before its tokens are sealed against its id', () => {
  // The AAD binds to the database-assigned id, so the row must exist first.
  const q = createIdentityQuery(3, 'accounts', new Date(0));
  assert.match(q.text, /INSERT INTO ctrader_identities/);
  assert.match(q.text, /RETURNING id/);
  assert.deepEqual(q.values, [3, 'accounts', new Date(0)]);
});

test('rotation writes both tokens in ONE statement', () => {
  // The refresh token is consumed by the call that produced these values, so this
  // pair is the only one that still works. Two statements means a crash between
  // them costs the user a full re-authorization.
  const q = rotateTokensQuery(7, 'ct-a', 'ct-r', new Date(0));
  assert.match(q.text, /UPDATE ctrader_identities/);
  assert.match(q.text, /access_token_ct = \$2/);
  assert.match(q.text, /refresh_token_ct = \$3/);
  assert.match(q.text, /revoked_at IS NULL/, 'a revoked identity must not accept new tokens');
  assert.equal(q.values.length, 4);
});

test('every identity read and write is scoped to its owner', () => {
  // An identity lookup that trusted only the id would be a cross-tenant read of
  // another user's OAuth tokens.
  for (const q of [identityForUserQuery(3, 7), listIdentitiesQuery(3),
    revokeIdentityQuery(3, 7), discoveredForIdentityQuery(3, 7)]) {
    assert.match(q.text, /user_id = \$1/, `not owner-scoped: ${q.text.slice(0, 50)}`);
    assert.equal(q.values[0], 3);
  }
});

test('revoking clears the ciphertext rather than only stamping revoked_at', () => {
  const q = revokeIdentityQuery(3, 7);
  assert.match(q.text, /revoked_at = now\(\)/);
  assert.match(q.text, /access_token_ct = ''/);
  assert.match(q.text, /refresh_token_ct = ''/);
});

test('the token ciphertext never appears in a list response', () => {
  // An endpoint that cannot fetch the ciphertext cannot leak it, whatever a later
  // refactor does to the response shape.
  const t = listIdentitiesQuery(3).text;
  assert.doesNotMatch(t, /access_token_ct/);
  assert.doesNotMatch(t, /refresh_token_ct/);
});

test('discovery upserts rather than duplicating on a re-discover', () => {
  const q = upsertDiscoveredQuery(7, {
    ctidTraderAccountId: 12345, traderLogin: 999, isLive: false,
    brokerName: 'Pepperstone', depositCurrency: 'USD', registeredAt: new Date(0),
  });
  assert.match(q.text, /ON CONFLICT \(identity_id, ctid_trader_account_id\) DO UPDATE/);
  assert.equal(q.values[1], 12345);
  assert.equal(q.values[3], false);
});

test('the picker learns which accounts are already claimed, in one query', () => {
  // Computing this in JS would need a second query and a race between them.
  const t = discoveredForIdentityQuery(3, 7).text;
  assert.match(t, /LEFT JOIN mt5_accounts/);
  assert.match(t, /AS claimed/);
});
