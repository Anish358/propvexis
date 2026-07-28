import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedisPair, redisEnabled, redisStatus, CONNECT_TIMEOUT_MS } from '../src/redis.js';
import { clusterSafety } from '../src/cluster.js';

// Redis is optional and REDIS_URL-gated. These tests need no Redis server: they
// pin the gating and the degrade-don't-die behaviour, which is the part that
// could take prod down.

test('disabled by default — no REDIS_URL means single-process behaviour', async () => {
  assert.equal(redisEnabled(), false, 'test env has no REDIS_URL');
  assert.equal(await createRedisPair({ warn() {}, info() {}, error() {} }), null);
  assert.equal(redisStatus.configured, false);
  assert.equal(redisStatus.connected, false);
});

test('an unreachable Redis degrades instead of stopping the app', async () => {
  // Point at a closed port: connect must fail, and createRedisPair must resolve
  // null rather than throw or hang. Booting degraded beats not booting.
  const { config } = await import('../src/config.js');
  const original = config.redisUrl;
  config.redisUrl = 'redis://127.0.0.1:6390'; // nothing listening
  const logged = [];
  try {
    const started = Date.now();
    const pair = await createRedisPair({
      warn: () => {}, info: () => {}, error: (_o, m) => logged.push(m),
    });
    assert.equal(pair, null, 'must resolve null, not throw');
    assert.ok(Date.now() - started < CONNECT_TIMEOUT_MS + 4000, 'must not hang past the connect timeout');
    assert.equal(redisStatus.connected, false);
    assert.ok(redisStatus.lastError, 'the failure is recorded for /metrics');
    assert.ok(
      logged.some((m) => /do NOT run multiple workers/i.test(m)),
      'and the operator is warned that clustering is now unsafe'
    );
  } finally {
    config.redisUrl = original;
    redisStatus.configured = false;
    redisStatus.connected = false;
    redisStatus.lastError = null;
  }
});

test('the connect timeout is bounded and short (boot latency is health-checked)', () => {
  assert.ok(CONNECT_TIMEOUT_MS > 0 && CONNECT_TIMEOUT_MS <= 10_000);
});

test('cluster safety is driven by LIVE redis state, not boot-time config', () => {
  // Redis can drop long after a healthy boot, at which point the socket adapter
  // silently stops crossing workers — so a connected:false must flip to unsafe.
  const clustered = true;
  const up = clusterSafety({ clustered, hasSharedSocketAdapter: true, hasSharedStatsCache: true });
  assert.equal(up.safe, true);

  const dropped = clusterSafety({ clustered, hasSharedSocketAdapter: false, hasSharedStatsCache: false });
  assert.equal(dropped.safe, false);
  assert.equal(dropped.reasons.length, 2);

  // Single worker is unaffected by Redis being down.
  assert.equal(
    clusterSafety({ clustered: false, hasSharedSocketAdapter: false, hasSharedStatsCache: false }).safe,
    true
  );
});
