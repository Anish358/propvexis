import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login, refresh } from '../worker/tradelocker/auth.js';

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body),
});

test('login() hits the DEMO host when isLive is false', async () => {
  let calledUrl = null;
  const fetchImpl = async (url) => {
    calledUrl = url;
    return jsonResponse(200, { accessToken: 'a1', refreshToken: 'r1' });
  };
  const tokens = await login({ email: 'a@b.com', password: 'p', server: 'S', isLive: false, fetchImpl });
  assert.match(calledUrl, /^https:\/\/demo\.tradelocker\.com\/backend-api\/auth\/jwt\/token$/);
  assert.deepEqual(tokens, { accessToken: 'a1', refreshToken: 'r1' });
});

test('login() hits the LIVE host when isLive is true', async () => {
  let calledUrl = null;
  const fetchImpl = async (url) => {
    calledUrl = url;
    return jsonResponse(200, { accessToken: 'a1', refreshToken: 'r1' });
  };
  await login({ email: 'a@b.com', password: 'p', server: 'S', isLive: true, fetchImpl });
  assert.match(calledUrl, /^https:\/\/live\.tradelocker\.com\/backend-api\/auth\/jwt\/token$/);
});

test('login() sends exactly email, password, server — never anything else', async () => {
  let sentBody = null;
  const fetchImpl = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return jsonResponse(200, { accessToken: 'a', refreshToken: 'r' });
  };
  await login({ email: 'a@b.com', password: 'secret', server: 'OSP-DEMO', isLive: false, fetchImpl });
  assert.deepEqual(sentBody, { email: 'a@b.com', password: 'secret', server: 'OSP-DEMO' });
});

test('a 401 from login() carries the status, so Ruling B\'s caller can branch on it', async () => {
  const fetchImpl = async () => jsonResponse(401, { error: 'bad credentials' });
  await assert.rejects(
    login({ email: 'a@b.com', password: 'wrong', server: 'S', isLive: false, fetchImpl }),
    (err) => { assert.equal(err.status, 401); return true; },
  );
});

test('refresh() posts refreshToken to /auth/jwt/refresh on the SAME host', async () => {
  let calledUrl = null;
  let sentBody = null;
  const fetchImpl = async (url, opts) => {
    calledUrl = url;
    sentBody = JSON.parse(opts.body);
    return jsonResponse(200, { accessToken: 'a2', refreshToken: 'r2' });
  };
  const tokens = await refresh({ refreshToken: 'r1', isLive: true, fetchImpl });
  assert.match(calledUrl, /^https:\/\/live\.tradelocker\.com\/backend-api\/auth\/jwt\/refresh$/);
  assert.deepEqual(sentBody, { refreshToken: 'r1' });
  assert.deepEqual(tokens, { accessToken: 'a2', refreshToken: 'r2' });
});

test('refresh() failure also carries a status, for the login() fallback', async () => {
  const fetchImpl = async () => jsonResponse(400, { error: 'expired' });
  await assert.rejects(
    refresh({ refreshToken: 'stale', isLive: false, fetchImpl }),
    (err) => { assert.equal(err.status, 400); return true; },
  );
});
