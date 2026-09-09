import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverAccount, TOO_MANY_ACCOUNTS_ERROR } from '../worker/tradelocker/discover.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
});

test('exactly one account resolves cleanly, with `live` threaded through from the caller', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    accounts: [{ id: '4242', name: 'Demo', currency: 'USD', status: 'ACTIVE', accNum: '1' }],
  });
  const result = await discoverAccount({
    host: 'https://demo.tradelocker.com/backend-api/', token: 't', isLive: false, fetchImpl,
  });
  assert.deepEqual(result, { accountId: 4242, accNum: 1, live: false });
});

test('RULING A: more than one account fails the job with the exact ruled message', async () => {
  const fetchImpl = async () => jsonResponse(200, {
    accounts: [
      { id: '1', accNum: '1' },
      { id: '2', accNum: '2' },
    ],
  });
  await assert.rejects(
    discoverAccount({ host: 'https://demo.tradelocker.com/backend-api/', token: 't', isLive: false, fetchImpl }),
    (err) => {
      assert.equal(err.message, TOO_MANY_ACCOUNTS_ERROR);
      return true;
    },
  );
});

test('zero accounts is refused too, distinctly from the more-than-one case', async () => {
  const fetchImpl = async () => jsonResponse(200, { accounts: [] });
  await assert.rejects(
    discoverAccount({ host: 'https://demo.tradelocker.com/backend-api/', token: 't', isLive: false, fetchImpl }),
    (err) => {
      assert.notEqual(err.message, TOO_MANY_ACCOUNTS_ERROR);
      return true;
    },
  );
});

test('an unusable id or accNum is refused rather than posting NaN into a banded login', async () => {
  const fetchImpl = async () => jsonResponse(200, { accounts: [{ id: 'not-a-number', accNum: '1' }] });
  await assert.rejects(
    discoverAccount({ host: 'https://demo.tradelocker.com/backend-api/', token: 't', isLive: false, fetchImpl }),
  );
});

test('the request carries the bearer token and no accNum (none is known yet)', async () => {
  let headers = null;
  const fetchImpl = async (url, opts) => {
    headers = opts.headers;
    return jsonResponse(200, { accounts: [{ id: '1', accNum: '1' }] });
  };
  await discoverAccount({ host: 'https://demo.tradelocker.com/backend-api/', token: 'tok', isLive: false, fetchImpl });
  assert.equal(headers.authorization, 'Bearer tok');
  assert.equal(headers.accNum, undefined, 'accNum is not known before discovery answers it');
});
