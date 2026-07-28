import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolOptions, POOL_DEFAULTS, pool } from '../src/db.js';

const cfg = (over = {}) => ({
  databaseUrl: 'postgres://localhost:5432/test_db',
  nodeEnv: 'test',
  pgPoolMax: 20,
  pgPoolIdleTimeoutMs: 30_000,
  pgPoolConnectionTimeoutMs: 5_000,
  pgPoolMaxUses: 7_500,
  ...over,
});

test('poolOptions maps config onto node-pg option names', () => {
  const o = poolOptions(cfg({ pgPoolMax: 33, pgPoolIdleTimeoutMs: 11_000 }));
  assert.equal(o.connectionString, 'postgres://localhost:5432/test_db');
  assert.equal(o.max, 33);
  assert.equal(o.idleTimeoutMillis, 11_000);
  assert.equal(o.connectionTimeoutMillis, 5_000);
  assert.equal(o.maxUses, 7_500);
});

test('a connection timeout is always set — a saturated pool must fail fast, not queue forever', () => {
  // The original bug: node-pg's default connectionTimeoutMillis is 0 = wait
  // indefinitely, so an exhausted pool hung request handlers instead of erroring.
  for (const bad of [undefined, null, 0, -1, NaN, 'abc']) {
    const o = poolOptions(cfg({ pgPoolConnectionTimeoutMs: Number(bad) }));
    assert.equal(o.connectionTimeoutMillis, POOL_DEFAULTS.connectionTimeoutMillis);
    assert.ok(o.connectionTimeoutMillis > 0, `${String(bad)} must not disable the timeout`);
  }
});

test('missing / non-numeric / non-positive env values fall back to positive defaults', () => {
  for (const bad of [undefined, null, 0, -5, NaN, 'twenty']) {
    const o = poolOptions(
      cfg({
        pgPoolMax: Number(bad),
        pgPoolIdleTimeoutMs: Number(bad),
        pgPoolConnectionTimeoutMs: Number(bad),
        pgPoolMaxUses: Number(bad),
      })
    );
    assert.deepEqual(
      {
        max: o.max,
        idleTimeoutMillis: o.idleTimeoutMillis,
        connectionTimeoutMillis: o.connectionTimeoutMillis,
        maxUses: o.maxUses,
      },
      POOL_DEFAULTS,
      `${String(bad)} should fall back to every default`
    );
    // maxUses: 0 would mean "recycle after the first checkout" — never allow it.
    assert.ok(o.maxUses > 1, 'maxUses must never collapse to 0/1');
  }
});

test('pool is tagged per environment for pg_stat_activity', () => {
  assert.equal(poolOptions(cfg({ nodeEnv: 'production' })).application_name, 'propvexis-production');
  assert.equal(poolOptions(cfg({ nodeEnv: undefined })).application_name, 'propvexis-development');
});

test('the live pool is actually tuned — regression guard on the bare Pool()', () => {
  // src/db.js used to be `new pg.Pool({ connectionString })`, silently capped at
  // node-pg's default of 10 clients. Assert the real exported pool carries the
  // tuned options, not just that poolOptions() computes them.
  assert.ok(pool.options.max >= 20, `expected max >= 20, got ${pool.options.max}`);
  assert.ok(pool.options.connectionTimeoutMillis > 0, 'live pool must fail fast when saturated');
  assert.ok(pool.options.idleTimeoutMillis > 0, 'live pool must evict idle clients');
});

test("pool has an 'error' listener so a dead idle client cannot crash the process", () => {
  // Without a listener, node-pg's emitted 'error' on an idle client is an
  // unhandled error event => process exit. One DB restart would take the API down.
  assert.ok(pool.listenerCount('error') >= 1, "pool must handle 'error'");
});
