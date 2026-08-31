import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tradelockerConnector } from '../src/domain/sync/connectors/tradelocker/index.js';
import { CONNECTORS, getConnector } from '../src/domain/sync/connectors/index.js';
import { findPlatform } from '../src/domain/sync/platforms.js';
import { findPlatformCard } from '../frontend/src/features/accounts/platformCatalog.js';

test('the credential requires email, server and password', () => {
  const r = tradelockerConnector.validateCredential({
    email: '  a@b.com ', server: ' OSP-DEMO ', password: 'pw',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { email: 'a@b.com', server: 'OSP-DEMO', password: 'pw' });
  assert.equal(tradelockerConnector.validateCredential({ email: 'a@b.com', server: 'S' }).ok, false);
});

test('each missing field is refused by name, and nothing partial is returned', () => {
  for (const [omit, pattern] of [['email', /email/i], ['server', /server/i], ['password', /password/i]]) {
    const input = { email: 'a@b.com', server: 'S', password: 'pw' };
    delete input[omit];
    const r = tradelockerConnector.validateCredential(input);
    assert.equal(r.ok, false, `a missing ${omit} must be refused`);
    assert.match(r.error, pattern);
    assert.equal(r.value, undefined, 'a rejected credential must not be half-stored');
  }
});

test('the email must look like an email — the login fails silently otherwise', () => {
  // A malformed email is not refused by /auth/jwt/token with anything readable;
  // it is a 401 that surfaces three hours later as a failed unattended job.
  for (const email of ['', '   ', 'not-an-email', 'a@b']) {
    assert.equal(tradelockerConnector.validateCredential({ email, server: 'S', password: 'p' }).ok,
      false, `${JSON.stringify(email)} must be refused`);
  }
});

test('the password is never trimmed, and never echoed back in an error', () => {
  // Trimming a password silently changes the credential; a leading space is a
  // legal character and the login would fail with no explanation. And the error
  // must not carry the secret — errors reach logs and Sentry.
  const r = tradelockerConnector.validateCredential({ email: 'a@b.com', server: 'S', password: ' pw ' });
  assert.equal(r.value.password, ' pw ');
  const bad = tradelockerConnector.validateCredential({ email: 'a@b.com', server: 'S', password: '' });
  assert.equal(bad.error.includes(''), true);
  assert.doesNotMatch(JSON.stringify(bad), /pw/);
});

test('validation never mutates its input', () => {
  const input = { email: ' a@b.com ', server: ' S ', password: 'p' };
  const copy = { ...input };
  tradelockerConnector.validateCredential(input);
  assert.deepEqual(input, copy);
});

test('POLICY PIN: the connector cannot place an order', () => {
  // Under spec §3 option (a) we hold a TRADE-CAPABLE credential — TradeLocker has
  // no investor password, no OAuth and no scope. Being unable to trade must be
  // STRUCTURAL, not a promise: there is no function to call.
  const surface = JSON.stringify(Object.keys(tradelockerConnector));
  for (const forbidden of ['placeOrder', 'createOrder', 'closePosition', 'modifyOrder', 'cancelOrder']) {
    assert.ok(!surface.includes(forbidden), `${forbidden} must not exist on the connector`);
  }
});

test('the connector knows its own login band, so nothing recomputes 5e12', () => {
  assert.equal(tradelockerConnector.toBandedLogin(4242), 5_000_000_004_242);
  assert.equal(tradelockerConnector.fromBandedLogin(5_000_000_004_242), 4242);
});

test('the module is registered, but the PLATFORM is still the switch', () => {
  // The registry entry exists so Task 7's worker has something to resolve. Auto
  // Sync stays off because platforms.js says `connector: null` — one switch, not
  // two, which is why getConnector resolves THROUGH the platform registry.
  assert.equal(CONNECTORS.tradelocker, tradelockerConnector);
  assert.equal(getConnector('tradelocker'), null,
    'TradeLocker must not Auto Sync until a real account has synced and reconciled');
});

test('the platform states plainly that the credential can trade', () => {
  // MT5's note promises a trade-capable password is REJECTED. Inheriting that
  // copy here would be a false security claim, which is why the note lives on
  // the descriptor and not in a shared page.
  const tl = findPlatform('tradelocker');
  assert.ok(tl.credentialNote && /trade/i.test(tl.credentialNote));
  assert.notEqual(tl.credentialNote, findPlatform('mt5').credentialNote);
  // The word "read-only" is fine — DENYING one is the honest statement. What must
  // never appear is MT5's PROMISE, that a trade-capable password is refused.
  assert.match(tl.credentialNote, /no read-only/i,
    'the note must say outright that no read-only credential exists');
  assert.doesNotMatch(tl.credentialNote, /rejected|deleted on the first login|use your investor/i,
    'inheriting MT5\'s promise here would be a false security claim on a funded account');
  assert.match(tl.credentialNote, /encrypt/i, 'the note must say how it is stored');
  assert.match(tl.credentialNote, /place trades/i, 'it must say what the credential can DO');
});

test('the credential form asks for email, server and password, in that order', () => {
  const fields = findPlatform('tradelocker').credentialFields;
  assert.deepEqual(fields.map((f) => f.name), ['email', 'server', 'password']);
  const password = fields.find((f) => f.name === 'password');
  assert.equal(password.secret, true, 'so no page logs or persists it');
  assert.equal(password.type, 'password');
  for (const f of fields) assert.equal(f.required, true);
});

test('TradeLocker stays Soon on BOTH sides until a real account has reconciled', () => {
  // Spec §13.2: derived P&L may not reconcile against /state, and we only learn
  // that against a live account. Flipping either catalog before then would offer
  // Auto Sync we cannot stand behind.
  assert.equal(findPlatform('tradelocker').enabled, false);
  assert.equal(findPlatform('tradelocker').connector, null);
  assert.equal(findPlatformCard('tradelocker').status, 'soon');
  assert.equal(findPlatform('tradelocker').importMethods.includes('auto_sync'), false);
});
