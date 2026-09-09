import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropVexisApi } from '../worker/ctrader/api.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
});

test('lease() defaults to ctrader-only, so no untouched call site changes behaviour', async () => {
  let sentBody = null;
  const fetchImpl = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return jsonResponse(200, { jobs: [] });
  };
  const api = new PropVexisApi({ baseUrl: 'http://x', workerToken: 't', workerId: 'w', fetchImpl });
  await api.lease(3);
  assert.deepEqual(sentBody.platforms, ['ctrader']);
});

test('lease() takes the platforms array, so the shared worker can pass both', async () => {
  let sentBody = null;
  const fetchImpl = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return jsonResponse(200, { jobs: [] });
  };
  const api = new PropVexisApi({ baseUrl: 'http://x', workerToken: 't', workerId: 'w', fetchImpl });
  await api.lease(3, ['ctrader', 'tradelocker']);
  assert.deepEqual(sentBody.platforms, ['ctrader', 'tradelocker']);
});
