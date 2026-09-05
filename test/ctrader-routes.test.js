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

test('every cTrader route is guarded, and by the guard its audience needs', () => {
  /* TWO AUDIENCES, TWO GUARDS. The user-facing routes take a session. The two
   * discovery routes take the worker's bearer token, because the worker is the
   * only thing that CAN enumerate a cTID's accounts -- that needs a protobuf
   * socket -- and it has no session.
   *
   * Direction is asserted, not just presence: a user route silently downgraded to
   * worker auth would let anything holding the farm token read or provision
   * another tenant's accounts. */
  const WORKER = new Set(['/api/ctrader/discovery/pending', '/api/ctrader/discovery/:id']);
  const routes = [...src.matchAll(/app\.(get|post|delete)\('([^']+)'(,\s*\{[^}]*\})?/g)];
  assert.ok(routes.length >= 8, `expected every route, found ${routes.length}`);
  for (const [, method, route, opts] of routes) {
    // The callback carries no preHandler by design: a cross-site redirect does
    // not reliably send a cookie, so its guard is the signed `state`.
    if (route === '/api/ctrader/callback') continue;
    const o = opts ?? '';
    if (WORKER.has(route)) {
      assert.match(o, /preHandler: requireWorker/, `${method} ${route} is a worker route`);
    } else {
      assert.match(o, /preHandler: app\.requireAuth/, `${method} ${route} must require a session`);
    }
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
