import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshAccessToken, REFRESH_SKEW_MS } from '../src/domain/sync/ctraderIdentities.js';

const cfg = { syncCredKey: 'a'.repeat(64), ctraderClientId: 'cid', ctraderClientSecret: 'sec' };
const HOUR = 3600_000;
// A row as ctraderLeasedPayloadQuery returns it. The ciphertexts are opened by an
// injected opener so this test says nothing about crypto — that is sealTokens' own test.
const row = (expiresInMs) => ({
  identity_id: 5,
  access_token_ct: 'ct-access',
  refresh_token_ct: 'ct-refresh',
  expires_at: new Date(Date.now() + expiresInMs),
});
const open = () => ({ accessToken: 'old-access', refreshToken: 'old-refresh' });

test('a token with plenty of life left is handed over untouched', () => {
  // Refreshing needlessly is not free: every refresh TERMINATES the sessions of
  // every account on that identity (landmine 10.1), so the worker would have to
  // re-authorize them all. The cheapest refresh is the one not made.
  let refreshed = false;
  return freshAccessToken(row(30 * 24 * HOUR), {
    cfg, open, refresh: async () => { refreshed = true; }, rotate: async () => {},
  }).then((r) => {
    assert.equal(r.accessToken, 'old-access');
    assert.equal(r.refreshed, false);
    assert.equal(refreshed, false);
  });
});

test('a token inside the skew window is refreshed before it is handed out', async () => {
  const calls = [];
  const r = await freshAccessToken(row(HOUR), {
    cfg,
    open,
    refresh: async ({ refreshToken }) => {
      calls.push(['refresh', refreshToken]);
      return { accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: new Date(Date.now() + 30 * 24 * HOUR) };
    },
    rotate: async (id, a, rf, exp) => { calls.push(['rotate', id, Boolean(a), Boolean(rf), Boolean(exp)]); return [{ id }]; },
  });
  assert.equal(r.accessToken, 'new-access');
  assert.equal(r.refreshed, true);
  assert.deepEqual(calls[0], ['refresh', 'old-refresh']);
  assert.deepEqual(calls[1], ['rotate', 5, true, true, true]);
});

test('THE ROTATION IS STORED BEFORE THE TOKEN IS USED', async () => {
  /* Landmine 10.2: the refresh token is CONSUMED on use. The instant cTrader
   * answers a refresh, the old refresh token is dead. If we hand the new access
   * token to the worker and only then fail to persist the pair, the identity is
   * unrecoverable — the stored refresh token no longer works and the user must
   * authorize from scratch, which they will experience as the connection
   * randomly breaking.
   *
   * So a rotation that cannot be stored is a HARD FAILURE here, not a warning. */
  await assert.rejects(
    freshAccessToken(row(HOUR), {
      cfg,
      open,
      refresh: async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: new Date() }),
      rotate: async () => { throw new Error('db down'); },
    }),
    /rotation/i,
    'a rotation that cannot be persisted must fail loudly, not hand out the token anyway',
  );
});

test('a rotation that stores nothing (revoked identity) is also a hard failure', async () => {
  // rotateTokensQuery has `WHERE id = $1 AND revoked_at IS NULL`, so a revoked
  // identity updates zero rows and returns []. Treating that as success would
  // hand out a token whose refresh half is already dead and unstored.
  await assert.rejects(
    freshAccessToken(row(HOUR), {
      cfg,
      open,
      refresh: async () => ({ accessToken: 'a', refreshToken: 'b', expiresAt: new Date() }),
      rotate: async () => [],
    }),
    /rotation/i,
  );
});

test('a failed refresh surfaces rather than handing over a stale token', async () => {
  await assert.rejects(
    freshAccessToken(row(HOUR), {
      cfg, open,
      refresh: async () => { throw new Error('invalid_grant'); },
      rotate: async () => {},
    }),
    /invalid_grant/,
  );
});

test('the skew is generous, because the cost of being wrong is asymmetric', () => {
  // The token lives ~30 days. Refreshing a day early costs one extra round trip
  // and one re-authorization of that identity's accounts; being a minute late
  // costs a failed job and a user-visible sync error.
  assert.equal(REFRESH_SKEW_MS, 24 * 60 * 60 * 1000);
});

test('a missing expiry is treated as expired, not as forever', async () => {
  // A null expires_at is a row we cannot reason about. Assuming it is still valid
  // is the choice that fails in production at an unknown time.
  let refreshed = false;
  await freshAccessToken({ ...row(HOUR), expires_at: null }, {
    cfg, open,
    refresh: async () => { refreshed = true; return { accessToken: 'n', refreshToken: 'r', expiresAt: new Date() }; },
    rotate: async () => [{ id: 5 }],
  });
  assert.equal(refreshed, true);
});
