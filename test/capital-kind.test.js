import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Route handlers cannot be exercised without an HTTP harness this repo does not
// have, so what is asserted here is that the route file WIRES the tested pure
// functions in — the same approach test/routes-split.test.js takes. The behaviour
// itself is pinned by provision.test.js and provision-tx.test.js.
const accountsRoute = readFileSync(new URL('../src/routes/accounts.js', import.meta.url), 'utf8');

test('provision is registered on the root app with requireAuth', () => {
  assert.match(accountsRoute, /app\.post\(\s*'\/api\/accounts\/provision'/);
  const handler = accountsRoute.slice(accountsRoute.indexOf("'/api/accounts/provision'"));
  assert.match(handler.slice(0, 200), /preHandler:\s*app\.requireAuth/);
  assert.equal(/app\.register\(/.test(accountsRoute), false,
    'a registered plugin cannot see app.requireAuth or the rate-limit hook');
});

test('provision delegates to the tested pure functions rather than re-deciding', () => {
  for (const fn of ['validateProvision', 'provisionGate', 'provisionAccount']) {
    assert.ok(accountsRoute.includes(fn), `${fn} is not used — the policy would be untested`);
  }
});

test('provision refuses Auto Sync when credentials cannot be encrypted', () => {
  // Storing a broker password we cannot encrypt is worse than not offering the
  // feature; sync.js already returns 503 for this and provision must agree.
  assert.ok(accountsRoute.includes('credentialsEnabled'));
  assert.match(accountsRoute, /503/);
});

test('provision maps a login collision to 409, not 500', () => {
  assert.ok(accountsRoute.includes('PROVISION_CONFLICT'));
  assert.match(accountsRoute, /409/);
});

test('login-available never reveals another tenant account', () => {
  const idx = accountsRoute.indexOf("'/api/accounts/login-available'");
  assert.ok(idx > -1, 'the route is missing');
  const handler = accountsRoute.slice(idx, idx + 1200);
  // It answers "can you use this login" and, only for the caller's own account,
  // "it is yours". Anything more is an enumeration oracle for other users' logins.
  assert.match(handler, /available/);
  assert.match(handler, /mine/);
  assert.equal(/label|ingest_token|user_id:/.test(handler), false,
    'no other-tenant detail may leave this endpoint');
});

test('the legacy POST /api/accounts forwards firm_id and product_id', () => {
  // This was a live bug: the handler never destructured firm_id, so the firm
  // picked in the template picker was dropped on create while PATCH saved it.
  const post = accountsRoute.slice(
    accountsRoute.indexOf("app.post('/api/accounts'"),
    accountsRoute.indexOf("app.patch('/api/accounts/:id'"),
  );
  for (const f of ['firm_id', 'firm_name', 'product_id', 'capital_kind']) {
    assert.ok(post.includes(f), `POST /api/accounts still drops ${f}`);
  }
});

test('no account creation path gives a live account a challenge', () => {
  // The fake-challenge bug. Both creation paths must guard it: provisionAccount
  // does so structurally (provision-tx.test.js), and the legacy POST needs the
  // same condition.
  const post = accountsRoute.slice(
    accountsRoute.indexOf("app.post('/api/accounts'"),
    accountsRoute.indexOf("app.patch('/api/accounts/:id'"),
  );
  const call = post.indexOf('createChallengeForAccount');
  assert.ok(call > -1, 'the legacy path still needs to create a challenge for prop accounts');
  assert.match(post.slice(Math.max(0, call - 200), call), /capital_kind/,
    'createChallengeForAccount must be guarded on capital_kind');
});
