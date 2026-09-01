import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CTRADER_LOGIN_BASE, toBandedLogin, fromBandedLogin, platformOfLogin,
  TRADELOCKER_LOGIN_BASE, toTradeLockerLogin, fromTradeLockerLogin,
} from '../src/domain/sync/logins.js';

test('the base is exactly 4e12 and is not quietly retuned', () => {
  // Changing this silently re-points every stored cTrader account at a different
  // login, orphaning its trades through the 0028 foreign key.
  assert.equal(CTRADER_LOGIN_BASE, 4_000_000_000_000);
});

test('a cTrader account round-trips through the band', () => {
  assert.equal(toBandedLogin(314943467), 4_000_314_943_467);
  assert.equal(fromBandedLogin(4_000_314_943_467), 314943467);
});

test('the band cannot collide with any plausible MT5 login', () => {
  // MT5 logins are 6-10 digits. Even the largest 10-digit login is three orders
  // of magnitude below the base.
  const biggestPlausibleMt5Login = 9_999_999_999;
  assert.ok(toBandedLogin(1) > biggestPlausibleMt5Login);
  assert.equal(platformOfLogin(314943467), 'metatrader');
  assert.equal(platformOfLogin(4_000_314_943_467), 'ctrader');
});

test('negative logins remain manual accounts — migration 0015 owns that space', () => {
  assert.equal(platformOfLogin(-42), 'manual');
  assert.equal(platformOfLogin(-1), 'manual');
});

test('platformOfLogin fails safe on junk rather than guessing', () => {
  assert.equal(platformOfLogin(undefined), null);
  assert.equal(platformOfLogin('not-a-number'), null);
});

test('the band survives a whole cTID worth of accounts', () => {
  for (const id of [1, 999, 1_000_000, 999_999_999_9]) {
    assert.equal(fromBandedLogin(toBandedLogin(id)), id);
    assert.equal(platformOfLogin(toBandedLogin(id)), 'ctrader');
  }
});

test('TradeLocker occupies its own band, disjoint from cTrader and MetaTrader', () => {
  // ORDER MATTERS in platformOfLogin: 5e12 >= 4e12, so testing the cTrader band
  // first would report every TradeLocker account as cTrader — no error, just the
  // wrong platform on every row, and the wrong worker fleet leasing the job.
  assert.equal(TRADELOCKER_LOGIN_BASE, 5_000_000_000_000);
  assert.equal(platformOfLogin(toTradeLockerLogin(4242)), 'tradelocker');
  assert.equal(fromTradeLockerLogin(toTradeLockerLogin(4242)), 4242);
  assert.equal(platformOfLogin(4_000_314_943_467), 'ctrader');
  assert.equal(platformOfLogin(5_000_000_004_242), 'tradelocker');
});

test('the TradeLocker band survives a whole login worth of accounts', () => {
  for (const id of [1, 999, 1_000_000, 999_999_999_9]) {
    assert.equal(fromTradeLockerLogin(toTradeLockerLogin(id)), id);
    assert.equal(platformOfLogin(toTradeLockerLogin(id)), 'tradelocker');
  }
});
