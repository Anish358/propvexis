import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConnector } from '../src/domain/sync/connectors/index.js';
import { mt5Connector } from '../src/domain/sync/connectors/mt5.js';

test('getConnector resolves mt5 and nothing else in Phase A', () => {
  assert.equal(getConnector('mt5'), mt5Connector);
  for (const id of ['mt4', 'ctrader', 'tradelocker', 'other']) {
    assert.equal(getConnector(id), null, `${id} must not resolve until its connector ships`);
  }
});

test('getConnector fails safe on unknown input', () => {
  assert.equal(getConnector('nope'), null);
  assert.equal(getConnector(undefined), null);
  assert.equal(getConnector(null), null);
});

test('mt5 credential: a complete input normalizes', () => {
  const r = mt5Connector.validateCredential({
    server: '  FundedNext-Server3  ',
    login: '34728798',
    password: 'investor-pw',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { server: 'FundedNext-Server3', login: 34728798, password: 'investor-pw' });
});

test('mt5 credential: the server is trimmed, never reformatted', () => {
  // The terminal's own log prints "FundedNext-Server 3" with a space and that
  // string does NOT work; the real server name has none. So trim the edges and
  // change nothing else — a "helpful" normalization here costs an unattended
  // login failure that surfaces ten minutes later as an expired lease.
  const r = mt5Connector.validateCredential({ server: ' Goat Funded-Server ', login: 1, password: 'x' });
  assert.equal(r.value.server, 'Goat Funded-Server');
});

test('mt5 credential: a missing or blank server is rejected', () => {
  for (const server of [undefined, null, '', '   ']) {
    const r = mt5Connector.validateCredential({ server, login: 1, password: 'x' });
    assert.equal(r.ok, false);
    assert.match(r.error, /server/i);
  }
});

test('mt5 credential: the login must be a positive integer', () => {
  // Negative logins are the synthetic space manual accounts live in, and a
  // fractional or non-numeric login can never match a real MT5 account.
  for (const login of [undefined, '', 'abc', 0, -5, 12.5, NaN]) {
    const r = mt5Connector.validateCredential({ server: 'S', login, password: 'x' });
    assert.equal(r.ok, false, `login ${String(login)} must be rejected`);
    assert.match(r.error, /login/i);
  }
  assert.equal(mt5Connector.validateCredential({ server: 'S', login: 1, password: 'x' }).ok, true);
});

test('mt5 credential: a missing password is rejected but never echoed', () => {
  const r = mt5Connector.validateCredential({ server: 'S', login: 1, password: '' });
  assert.equal(r.ok, false);
  assert.match(r.error, /password/i);
});

test('mt5 credential: an error result carries no value, so nothing partial is stored', () => {
  const r = mt5Connector.validateCredential({});
  assert.equal(r.ok, false);
  assert.equal(r.value, undefined);
});

test('mt5 credential: validation never mutates its input', () => {
  const input = { server: ' S ', login: '7', password: 'p' };
  const copy = { ...input };
  mt5Connector.validateCredential(input);
  assert.deepEqual(input, copy);
});
