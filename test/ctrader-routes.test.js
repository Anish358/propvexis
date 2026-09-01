import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

const read = (p) => readFileSync(path.join(repoRoot, 'src', p), 'utf8');
const src = read('routes/ctrader.js');
const appJs = read('app.js');

test('the module is exported for a plain call, not app.register()', () => {
  // A registered plugin is encapsulated: app.requireAuth would be undefined at
  // registration time and the global rate-limit hook would not apply.
  assert.match(src, /export default function ctraderRoutes\(app/);
  assert.match(appJs, /^ctraderRoutes\(app\);$/m);
  assert.doesNotMatch(appJs, /app\.register\(ctraderRoutes/);
});

test('every cTrader route except the OAuth callback requires a session', () => {
  const routes = [...src.matchAll(/app\.(get|post|delete)\('([^']+)'(,\s*\{[^}]*\})?/g)];
  assert.ok(routes.length >= 5, `expected the five routes, found ${routes.length}`);
  for (const [, method, route, opts] of routes) {
    if (route === '/api/ctrader/callback') continue;
    assert.match(opts ?? '', /preHandler: app\.requireAuth/,
      `${method} ${route} must require a session`);
  }
});

test('the callback is guarded by the signed state, not by a query parameter', () => {
  // THE HOLE THIS CLOSES: reading the user id from the query would let anyone
  // attach their own cTrader identity to another person's account.
  assert.match(src, /verifyState\(req\.query\?\.state/);
  assert.doesNotMatch(src, /req\.query\.\s*(user_?id|uid)/i);
  assert.doesNotMatch(src, /req\.body\?\.\s*(user_?id|uid)/i);
});

test('the code is exchanged BEFORE any database work', () => {
  // The authorization code expires after sixty seconds; a slow callback fails in
  // a way that reads exactly like a bad client secret.
  const exchange = src.indexOf('exchangeCode({ code })');
  const create = src.indexOf('createIdentity(');
  assert.ok(exchange > -1 && create > -1);
  assert.ok(exchange < create, 'exchangeCode must run before createIdentity');
});

test('the identity row is created before its tokens are sealed', () => {
  // The AAD binds to the database-assigned id; sealing against a guessed id
  // produces a row nothing can ever open.
  assert.ok(src.indexOf('createIdentity(') < src.indexOf('sealTokens('));
});

test('every route fails closed when cTrader is unconfigured', () => {
  // Starting an OAuth flow we cannot complete, or accepting tokens we cannot
  // encrypt, is worse than not offering the feature.
  assert.match(src, /ctraderEnabled\(config\)/);
  assert.match(src, /identitiesEnabled\(\)/);
  assert.match(src, /503/);
});

test('revoking a grant does not delete the trader journal', () => {
  // "Stop reading my broker" is not "delete my trades".
  assert.doesNotMatch(src, /DELETE FROM trades|deleteAccount|cascade/i);
});

test('no reply ever carries token ciphertext', () => {
  // The ciphertext legitimately appears on the WRITE path (sealTokens ->
  // rotateTokens). What must never happen is it reaching a client, so this
  // asserts on what is sent rather than on what is mentioned.
  for (const m of src.matchAll(/reply\.send\(([\s\S]{0,200}?)\);/g)) {
    assert.doesNotMatch(m[1], /token_ct|accessToken|refreshToken/,
      `a reply.send carries token material: ${m[1].slice(0, 60)}`);
  }
});
