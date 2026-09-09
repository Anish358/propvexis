import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getConfig, _resetConfigCache, ACCOUNT_DETAILS_FIELDS } from '../worker/tradelocker/config.js';
import { repoRoot } from '../src/platform/paths.js';

const FIXTURE = JSON.parse(
  readFileSync(path.join(repoRoot, 'test/fixtures/tradelocker/config.json'), 'utf8'),
);

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
});

test.beforeEach(() => _resetConfigCache());

test('getConfig fetches /trade/config with the token and accNum headers', async () => {
  let calledUrl = null;
  let headers = null;
  const fetchImpl = async (url, opts) => {
    calledUrl = url;
    headers = opts.headers;
    return jsonResponse(200, FIXTURE);
  };
  const config = await getConfig({ host: 'https://demo.tradelocker.com/backend-api/', token: 'tok', accNum: 1, fetchImpl });
  assert.match(calledUrl, /trade\/config$/);
  assert.equal(headers.authorization, 'Bearer tok');
  assert.equal(headers.accNum, '1');
  assert.deepEqual(config, FIXTURE);
});

test('a fetched config is cached per host and never re-fetched', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return jsonResponse(200, FIXTURE); };
  const host = 'https://demo.tradelocker.com/backend-api/';
  await getConfig({ host, token: 't', accNum: 1, fetchImpl });
  await getConfig({ host, token: 't', accNum: 1, fetchImpl });
  await getConfig({ host, token: 't', accNum: 2, fetchImpl }); // even a different accNum
  assert.equal(calls, 1, 'the second and third calls must be served from the process-lifetime cache');
});

test('a config missing a required ordersHistory field throws at fetch time, not mid-backfill', async () => {
  const broken = JSON.parse(JSON.stringify(FIXTURE));
  broken.d.ordersHistoryConfig.columns = broken.d.ordersHistoryConfig.columns.filter((c) => c.id !== 'commission');
  const fetchImpl = async () => jsonResponse(200, broken);
  await assert.rejects(
    getConfig({ host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, fetchImpl }),
    /commission/,
  );
});

test('a config missing a required accountDetails field throws too — reconcile depends on it', async () => {
  const broken = JSON.parse(JSON.stringify(FIXTURE));
  broken.d.accountDetailsConfig.columns = broken.d.accountDetailsConfig.columns.filter((c) => c.id !== 'balance');
  const fetchImpl = async () => jsonResponse(200, broken);
  await assert.rejects(
    getConfig({ host: 'https://demo.tradelocker.com/backend-api/', token: 't', accNum: 1, fetchImpl }),
    /balance/,
  );
});

test('a failed validation is not cached — a later, fixed fetch is not shadowed by the broken one', async () => {
  const broken = JSON.parse(JSON.stringify(FIXTURE));
  broken.d.ordersHistoryConfig.columns = [];
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    return jsonResponse(200, call === 1 ? broken : FIXTURE);
  };
  const host = 'https://demo.tradelocker.com/backend-api/';
  await assert.rejects(getConfig({ host, token: 't', accNum: 1, fetchImpl }));
  const config = await getConfig({ host, token: 't', accNum: 1, fetchImpl });
  assert.deepEqual(config, FIXTURE);
});

test('ACCOUNT_DETAILS_FIELDS are exactly the ones reconcile.js needs', () => {
  assert.deepEqual([...ACCOUNT_DETAILS_FIELDS], ['balance', 'openNetPnL']);
});
