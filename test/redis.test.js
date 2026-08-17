import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedisPair, redisEnabled, redisStatus, redisNamespace, CONNECT_TIMEOUT_MS } from '../src/platform/redis.js';
import { clusterSafety } from '../src/platform/cluster.js';
import { createStatsBus, INVALIDATE_CHANNEL } from '../src/platform/statsBus.js';

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
  const { config } = await import('../src/platform/config.js');
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

test('CROSS-ENV ISOLATION: prod/staging/dev share one Redis, so channels must differ', () => {
  // Redis pub/sub is GLOBAL — selecting a different database does NOT isolate it.
  // Without a per-env prefix, a prod socket broadcast would be delivered to a
  // staging client, and since staging/dev DBs are replicas of prod the user ids
  // match, so it would actually reach a real session.
  const envs = ['prod', 'staging', 'dev', 'local'];
  const namespaces = envs.map((e) => redisNamespace(e));
  assert.equal(new Set(namespaces).size, envs.length, 'every env needs a distinct namespace');
  for (const ns of namespaces) assert.match(ns, /^propvexis:/);
  assert.equal(redisNamespace('prod'), 'propvexis:prod');
  // An unset APP_ENV must not collide with a real env.
  assert.equal(redisNamespace(undefined), 'propvexis:local');
  assert.equal(redisNamespace(''), 'propvexis:local');
});

test('the invalidation channel is namespaced per environment', () => {
  const cache = { invalidateUser() {} };
  const bus = createStatsBus({ cache });
  assert.equal(bus.channel, INVALIDATE_CHANNEL, 'unprefixed by default (single-process)');

  const sent = [];
  bus.setTransport((ch, m) => sent.push(ch), `${redisNamespace('prod')}:${INVALIDATE_CHANNEL}`);
  bus.invalidate(1);
  assert.equal(sent[0], 'propvexis:prod:propvexis:stats:invalidate');

  // A staging bus must publish somewhere a prod subscriber is not listening.
  const other = createStatsBus({ cache });
  other.setTransport(() => {}, `${redisNamespace('staging')}:${INVALIDATE_CHANNEL}`);
  assert.notEqual(other.channel, bus.channel, 'prod and staging must not share a channel');
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
