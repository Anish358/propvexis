import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatsCache, cacheKey, MAX_ENTRIES } from '../src/statsCache.js';

const SCOPE_A = { god: true, userId: 1, logins: [100, 200], filterCol: 'user_id' };
const SCOPE_B = { god: false, userId: 2, logins: [300], filterCol: 'account_id' };

test('cacheKey includes every input that changes the numbers', () => {
  const base = cacheKey('stats', SCOPE_A, 'R', { setups: ['SMC'] }, false);
  assert.notEqual(base, cacheKey('stats', SCOPE_A, 'USD', { setups: ['SMC'] }, false), 'unit');
  assert.notEqual(base, cacheKey('stats', SCOPE_A, 'R', { setups: ['SMC'] }, true), 'beRound');
  assert.notEqual(base, cacheKey('stats', SCOPE_A, 'R', { setups: ['Other'] }, false), 'filters');
  assert.notEqual(base, cacheKey('stats', SCOPE_B, 'R', { setups: ['SMC'] }, false), 'scope');
  assert.notEqual(base, cacheKey('yearly', SCOPE_A, 'R', { setups: ['SMC'] }, false), 'kind');
  assert.notEqual(
    cacheKey('yearly', SCOPE_A, 'R', {}, false, 2025),
    cacheKey('yearly', SCOPE_A, 'R', {}, false, 2026),
    'year'
  );
});

test('cacheKey is stable across key order and equivalent scopes', () => {
  assert.equal(
    cacheKey('stats', SCOPE_A, 'R', { setups: ['SMC'], symbols: ['EURUSD'] }, false),
    cacheKey('stats', SCOPE_A, 'R', { symbols: ['EURUSD'], setups: ['SMC'] }, false)
  );
  // Login order must not fork the cache.
  const reordered = { ...SCOPE_A, logins: [200, 100] };
  assert.equal(cacheKey('stats', SCOPE_A, 'R', {}, false), cacheKey('stats', reordered, 'R', {}, false));
  // undefined-valued filters must not differ from absent ones.
  assert.equal(
    cacheKey('stats', SCOPE_A, 'R', { setups: ['SMC'] }, false),
    cacheKey('stats', SCOPE_A, 'R', { setups: ['SMC'], from: undefined }, false)
  );
});

test('wrap computes once, then serves from cache', async () => {
  const c = createStatsCache();
  let calls = 0;
  const produce = async () => { calls += 1; return { n: calls }; };
  const key = cacheKey('stats', SCOPE_A, 'R', {}, false);

  assert.deepEqual(await c.wrap(key, SCOPE_A, produce), { n: 1 });
  assert.deepEqual(await c.wrap(key, SCOPE_A, produce), { n: 1 }, 'second call is a hit');
  assert.equal(calls, 1);
  assert.equal(c.stats().hits, 1);
});

test('a write invalidates only that user — one trader cannot flush another', async () => {
  const c = createStatsCache();
  const kA = cacheKey('stats', SCOPE_A, 'R', {}, false);
  const kB = cacheKey('stats', SCOPE_B, 'R', {}, false);
  c.set(kA, 'a', SCOPE_A);
  c.set(kB, 'b', SCOPE_B);

  c.invalidateUser(SCOPE_A.userId);
  assert.equal(c.get(kA), undefined, "user 1's entry is gone");
  assert.equal(c.get(kB), 'b', "user 2's entry survives");
});

test('invalidateUser accepts a string id (req.user.uid arrives as text)', () => {
  const c = createStatsCache();
  const k = cacheKey('stats', SCOPE_A, 'R', {}, false);
  c.set(k, 'v', SCOPE_A);
  c.invalidateUser('1');
  assert.equal(c.get(k), undefined, 'string/number ids must not fork the comparison');
});

test('an unknown owner clears everything — slow, never stale', () => {
  const c = createStatsCache();
  c.set('k1', 'a', SCOPE_A);
  c.set('k2', 'b', SCOPE_B);
  // A trade whose user_id is null (unbound account) cannot be attributed.
  c.invalidateUser(null);
  assert.equal(c.size, 0);
});

test('entries with an unknown owner are dropped by any invalidation', () => {
  const c = createStatsCache();
  c.set('anon', 'x', { userId: null, logins: [] });
  c.set('mine', 'y', SCOPE_A);
  c.invalidateUser(SCOPE_A.userId);
  assert.equal(c.get('anon'), undefined, 'cannot prove it is unaffected, so drop it');
});

test('TTL expiry is a backstop for a missed invalidation', () => {
  let t = 1000;
  const c = createStatsCache({ ttlMs: 500, now: () => t });
  c.set('k', 'v', SCOPE_A);
  t = 1400;
  assert.equal(c.get('k'), 'v', 'still fresh');
  t = 1600;
  assert.equal(c.get('k'), undefined, 'expired');
  assert.equal(c.size, 0, 'and evicted on read');
});

test('bounded: eviction keeps memory flat on a 1GB box', () => {
  const c = createStatsCache({ maxEntries: 3 });
  for (const k of ['a', 'b', 'c', 'd']) c.set(k, k, SCOPE_A);
  assert.equal(c.size, 3);
  assert.equal(c.get('a'), undefined, 'oldest evicted');
  assert.equal(c.get('d'), 'd');
  assert.equal(c.stats().evictions, 1);
});

test('eviction is LRU: reading an entry protects it', () => {
  const c = createStatsCache({ maxEntries: 2 });
  c.set('a', 1, SCOPE_A);
  c.set('b', 2, SCOPE_A);
  c.get('a');            // 'a' is now the most recently used
  c.set('c', 3, SCOPE_A); // evicts the least recently used, 'b'
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('c'), 3);
});

test('default bound is set and finite', () => {
  assert.ok(Number.isFinite(MAX_ENTRIES) && MAX_ENTRIES > 0);
});
