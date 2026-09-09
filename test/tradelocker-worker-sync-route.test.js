import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';

// This repo has no test database and no HTTP test harness (see the header
// comment on src/domain/accounts/provision.js), so routes/sync.js — like
// routes/ctrader.js in test/ctrader-routes.test.js — is pinned at the SOURCE
// level: the lease route's TradeLocker block, mirrored from the MT5 one, is
// asserted to exist, decrypt-fail the same way, and never leak `read_only`
// into the branch that means something different on this platform.

const src = readFileSync(path.join(repoRoot, 'src/routes/sync.js'), 'utf8');

test('the TradeLocker block imports and drains its own leased-payload query', () => {
  assert.match(src, /tradelockerLeasedPayloads/);
  assert.match(src, /for \(const row of await tradelockerLeasedPayloads\(byPlatform\.tradelocker\)\)/);
});

test('a TradeLocker credential that fails to decrypt fails the job loudly, never silently', () => {
  // Same shape as the MT5 branch: failJob + markError, not a silent skip.
  const block = src.slice(src.indexOf('---- TradeLocker'), src.indexOf('A job whose platform we do not recognise'));
  assert.match(block, /openPassword\(row\)/);
  assert.match(block, /await failJob\(row\.job_id, 'stored credential could not be decrypted'\)/);
  assert.match(block, /await markError\(row\.account_id,/);
});

test('the assembled TradeLocker job carries everything the worker needs, and never a stray field', () => {
  const block = src.slice(src.indexOf('---- TradeLocker'), src.indexOf('A job whose platform we do not recognise'));
  for (const field of [
    'job_id', 'account_id', "platform: 'tradelocker'", 'login', 'email:', 'server:',
    'password', 'tl_account_id', 'tl_acc_num', 'is_live_env', 'ingest_token', 'since', 'cursor_at', 'reason',
  ]) {
    assert.match(block, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `job payload must carry ${field}`);
  }
});

test('is_live_env is passed through raw, never coerced to a boolean, in the lease response', () => {
  // Ruling B: NULL is a real state ("not yet decided") the worker must be able
  // to see. `row.is_live_env === true` (what the cTrader block does, correctly,
  // because its identity is always already decided) would collapse NULL to
  // false and make every first TradeLocker job probe forever.
  const block = src.slice(src.indexOf('---- TradeLocker'), src.indexOf('A job whose platform we do not recognise'));
  assert.match(block, /is_live_env: row\.is_live_env,/);
  assert.doesNotMatch(block, /is_live_env: row\.is_live_env === true/);
});

test('REGRESSION PIN: a TradeLocker job can never reach the read_only rejection branch', () => {
  // b.read_only === false is the MT5-only master-password rejection. The
  // TradeLocker worker (worker/tradelocker/index.js) must never send
  // `read_only` at all — this pins BOTH halves: the branch stays scoped to a
  // literal `false` (never truthy-checked in a way TradeLocker could trip),
  // and the worker's own report body never sets the key.
  assert.match(src, /if \(b\.read_only === false\) \{/);
  const workerSrc = readFileSync(path.join(repoRoot, 'worker/tradelocker/index.js'), 'utf8');
  // A property key, not prose: the file's own comments explain the rule using
  // the word "read_only" in backticks, which must not trip this pin.
  assert.doesNotMatch(workerSrc, /read_only\s*:/);
});

test('a successful TradeLocker result persists tl_account_id/tl_acc_num/is_live_env, best-effort', () => {
  assert.match(src, /recordTradeLockerAccount/);
  const resultHandler = src.slice(src.indexOf("app.post('/api/sync/jobs/:id/result'"));
  assert.match(resultHandler, /if \(b\.tl_account_id != null\) \{/);
  assert.match(resultHandler, /tlAccountId: Number\(b\.tl_account_id\)/);
  assert.match(resultHandler, /isLive: b\.is_live_env === true/);
  // Best-effort: a storage failure must not throw out of the handler and fail
  // a job that already imported trades successfully — same contract as
  // recordBrokerAccount just above it.
  assert.match(resultHandler, /try \{[\s\S]*?recordTradeLockerAccount[\s\S]*?\} catch \(err\) \{/);
});

test('every worker route stays worker-guarded, including nothing new for TradeLocker', () => {
  const routes = [...src.matchAll(/app\.(get|post|delete)\('([^']+)'(,\s*\{[^}]*\})?/g)];
  const WORKER = new Set(['/api/sync/lease', '/api/sync/jobs/:id/result', '/api/sync/heartbeat']);
  for (const [, method, route, opts] of routes) {
    if (!WORKER.has(route)) continue;
    assert.match(opts ?? '', /preHandler: requireWorker/, `${method} ${route} must stay worker-only`);
  }
});
