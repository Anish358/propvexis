import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterSafety, isClustered, advisePoolMax } from '../src/cluster.js';

// pm2 cluster mode is wired up but shipped with instances=1, because two pieces
// of per-process state would break silently with more workers: Socket.IO's
// in-memory adapter and the analytics cache. These tests pin the guard that
// makes that constraint enforceable instead of a comment nobody reads.

test('a single worker is always safe', () => {
  const r = clusterSafety({ clustered: false, hasSharedSocketAdapter: false, hasSharedStatsCache: false });
  assert.deepEqual(r, { safe: true, reasons: [] });
});

test('clustered without a shared socket adapter is flagged', () => {
  const r = clusterSafety({ clustered: true, hasSharedSocketAdapter: false, hasSharedStatsCache: true });
  assert.equal(r.safe, false);
  assert.equal(r.reasons.length, 1);
  assert.match(r.reasons[0], /socket\.io/);
  assert.match(r.reasons[0], /sticky sessions/);
});

test('clustered without shared cache invalidation is flagged', () => {
  const r = clusterSafety({ clustered: true, hasSharedSocketAdapter: true, hasSharedStatsCache: false });
  assert.equal(r.safe, false);
  assert.equal(r.reasons.length, 1);
  assert.match(r.reasons[0], /stale/);
});

test("today's reality — clustered with neither — reports both reasons", () => {
  const r = clusterSafety({ clustered: true, hasSharedSocketAdapter: false, hasSharedStatsCache: false });
  assert.equal(r.safe, false);
  assert.equal(r.reasons.length, 2, 'both blockers must be named, not just the first');
});

test('clustered WITH both shared pieces is safe (the post-Redis state)', () => {
  const r = clusterSafety({ clustered: true, hasSharedSocketAdapter: true, hasSharedStatsCache: true });
  assert.deepEqual(r, { safe: true, reasons: [] });
});

test('isClustered detects pm2 cluster mode via NODE_APP_INSTANCE', () => {
  assert.equal(isClustered({}), false, 'fork mode: no worker index');
  assert.equal(isClustered({ NODE_APP_INSTANCE: '0' }), true, 'worker 0 still counts');
  assert.equal(isClustered({ NODE_APP_INSTANCE: '3' }), true);
});

test('advisePoolMax keeps workers x pool inside max_connections', () => {
  // 3 envs, 1 worker each, 97 usable connections -> 32 per process.
  assert.equal(advisePoolMax({ workers: 1 }), 32);
  // 2 workers per env halves the per-process budget.
  assert.equal(advisePoolMax({ workers: 2 }), 16);
  assert.equal(advisePoolMax({ workers: 4 }), 8);
  // The shipped default (20) fits a single worker but NOT four.
  assert.ok(advisePoolMax({ workers: 1 }) >= 20, 'PG_POOL_MAX=20 is safe at 1 worker');
  assert.ok(advisePoolMax({ workers: 4 }) < 20, 'and must be lowered at 4 workers');
  // A single env with the whole server to itself gets more.
  assert.equal(advisePoolMax({ workers: 1, envs: 1 }), 97);
  // Never returns 0 or negative, however absurd the inputs.
  assert.equal(advisePoolMax({ workers: 1000, envs: 1000 }), 1);
  assert.equal(advisePoolMax({ workers: 0, envs: 0 }), 97);
});
