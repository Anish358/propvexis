import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import { routeSources } from './helpers/backend-src.js';
import { workerTokenMatches } from '../src/domain/sync/workerAuth.js';

// The sync farm hands a plaintext broker password to a machine outside our VPC,
// so the properties worth pinning are about what CANNOT happen: the worker
// endpoints cannot open without a token, the password cannot appear anywhere but
// the lease response, and a user cannot reach another user's account.

const syncSrc = () => routeSources.find((r) => r.file === 'sync.js').text;

// backend-src.js's sourceOf() returns the whole module, which is the wrong grain
// for "this HANDLER does X" — every handler in the file would satisfy it. Slice
// one handler: from its registration to the start of the next one.
function handler(method, path) {
  const src = syncSrc();
  const at = src.indexOf(`app.${method}('${path}'`);
  assert.ok(at > 0, `${method} ${path} is registered`);
  const rest = src.slice(at + 10);
  const next = rest.search(/\n  app\.(get|post|put|patch|delete)\('/);
  return next === -1 ? rest : rest.slice(0, next);
}

test('worker auth fails closed when the token is unset', () => {
  // The failure that matters: a box deployed without SYNC_WORKER_TOKEN must not
  // accept an empty bearer and hand out every stored credential.
  assert.equal(workerTokenMatches('Bearer anything', ''), false);
  assert.equal(workerTokenMatches('', ''), false);
  assert.equal(workerTokenMatches(undefined, undefined), false);
  assert.equal(workerTokenMatches('Bearer x', null), false);
});

test('worker auth accepts only the exact token', () => {
  const token = 'a'.repeat(40);
  assert.equal(workerTokenMatches(`Bearer ${token}`, token), true);
  assert.equal(workerTokenMatches(token, token), true);            // bare, no prefix
  assert.equal(workerTokenMatches(`bearer ${token}`, token), true); // case-insensitive prefix
  assert.equal(workerTokenMatches(`Bearer ${token}x`, token), false);
  assert.equal(workerTokenMatches(`Bearer ${'a'.repeat(39)}`, token), false);
  assert.equal(workerTokenMatches('Bearer ' + 'b'.repeat(40), token), false);
});

test('the comparison is constant-time, not ===', () => {
  // A === on a never-rotating secret leaks its prefix through timing, and the
  // leak is invisible in behaviour — so assert on the mechanism.
  const text = readFileSync(new URL('../src/domain/sync/workerAuth.js', import.meta.url), 'utf8');
  assert.match(text, /timingSafeEqual/);
  assert.ok(!/given\s*===\s*want/.test(text));
});

test('only the lease response carries a plaintext password', () => {
  const src = syncSrc();
  // openPassword is the only decrypt call site, and it is inside the lease handler.
  const decrypts = [...src.matchAll(/openPassword\(/g)].length;
  assert.equal(decrypts, 1, 'exactly one decrypt call site');
  // The status endpoint returns the credential metadata row, which by
  // construction cannot contain the ciphertext (see credentialStatusQuery).
  assert.ok(!/password_ct/.test(src), 'the route layer never handles ciphertext directly');
});

test('a credential that will not decrypt fails its job instead of being skipped', () => {
  // Silently skipping would leave the account looking "queued" forever.
  const src = syncSrc();
  assert.match(src, /catch \(err\)[\s\S]{0,400}failJob\(/);
  assert.match(src, /could not be decrypted/);
});

test('a master password is deleted before anything else happens', () => {
  const src = handler('post', '/api/sync/jobs/:id/result');
  assert.match(src, /read_only === false[\s\S]{0,300}rejectMasterPassword\(/);
});

test('a job result can only touch the account the job is for', () => {
  // Found in review: taking account_id from the body let any token-holding caller
  // mark ANOTHER tenant's credential "verified read-only" with no login, or delete
  // it. The account must come from the job row, and the caller must hold the lease.
  const src = handler('post', '/api/sync/jobs/:id/result');
  assert.match(src, /jobForWorker\(jobId, workerId\)/);
  assert.match(src, /Number\(owned\.account_id\)/);
  assert.ok(!/Number\(b\.account_id\)/.test(src), 'account_id must not come from the request body');
  for (const call of ['rejectMasterPassword(', 'markVerified(', 'markError(']) {
    const at = src.indexOf(call);
    assert.ok(at > src.indexOf('jobForWorker('), `${call} must run after the lease check`);
  }
});

test('every user-facing sync route goes through the ownership + plan guard', () => {
  const src = syncSrc();
  for (const route of [
    "app.get('/api/accounts/:id/sync'",
    "app.post('/api/accounts/:id/sync'",
    "app.put('/api/accounts/:id/credentials'",
    "app.delete('/api/accounts/:id/credentials'",
  ]) {
    const at = src.indexOf(route);
    assert.ok(at > 0, `${route} exists`);
    const body = src.slice(at, at + 700);
    assert.match(body, /ownedSyncAccount\(req, reply\)/, `${route} must check ownership`);
  }
  // And that guard is what enforces tenancy, kind and plan.
  const guard = src.slice(src.indexOf('const ownedSyncAccount'), src.indexOf('// Worker endpoints'));
  assert.match(guard, /ownedAccountById\(req\.user\.uid/);
  assert.match(guard, /kind !== 'synced'/);
  assert.match(guard, /canUseEA/);
});

test('storing a credential is refused when there is no key to encrypt it with', () => {
  const src = handler('put', '/api/accounts/:id/credentials');
  assert.match(src, /credentialsEnabled\(\)[\s\S]{0,200}503/);
});

test('an unbound account cannot get a credential without its MT5 login', () => {
  // The farm cannot learn the login from a first trade the way the EA does.
  const src = handler('put', '/api/accounts/:id/credentials');
  assert.match(src, /login required for an unbound account/);
  assert.match(src, /bindOrCheckLogin/);
});

test('a saved credential is synced immediately', () => {
  const src = handler('put', '/api/accounts/:id/credentials');
  assert.match(src, /enqueue\(acct\.id, 'first_sync'\)/);
});

test('scheduled syncs pause outside market hours but manual ones do not', () => {
  const lease = handler('post', '/api/sync/lease');
  assert.match(lease, /isMarketOpen\(\) \? await enqueueDue\(\) : \[\]/);
  const manual = handler('post', '/api/accounts/:id/sync');
  assert.ok(!/isMarketOpen/.test(manual), 'a manual sync must work on a Saturday');
});
