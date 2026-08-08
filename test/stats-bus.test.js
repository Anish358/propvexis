import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStatsBus, encodeInvalidation, decodeInvalidation, newOrigin, INVALIDATE_CHANNEL,
} from '../src/platform/statsBus.js';

// The bus fans cache invalidations across pm2 workers over Redis pub/sub. All of
// it is transport-injected, so these run with no Redis in CI.

// Minimal stand-in for statsCache: records who was invalidated.
const fakeCache = () => {
  const calls = [];
  return { calls, invalidateUser: (u) => calls.push(u) };
};

test('invalidate() always invalidates locally AND fans out', () => {
  const cache = fakeCache();
  const sent = [];
  const bus = createStatsBus({ cache, publish: (ch, m) => sent.push([ch, m]), origin: 'w1' });

  bus.invalidate(7);
  assert.deepEqual(cache.calls, [7], 'local cache dropped');
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], INVALIDATE_CHANNEL);
  assert.deepEqual(JSON.parse(sent[0][1]), { u: 7, o: 'w1' });
});

test('THE INVARIANT: a failing transport must not skip local invalidation', () => {
  // If Redis is down, the worker that handled the write still has to drop its own
  // stale entries — otherwise the writing user sees their own stale dashboard,
  // which is worse than the cross-worker staleness this bus exists to fix.
  const cache = fakeCache();
  const bus = createStatsBus({
    cache,
    publish: () => { throw new Error('redis down'); },
    log: { warn: () => {} },
  });

  assert.doesNotThrow(() => bus.invalidate(7), 'a publish failure must never propagate to the request');
  assert.deepEqual(cache.calls, [7], 'local invalidation still happened');
  assert.equal(bus.stats().publishErrors, 1);
  assert.equal(bus.stats().published, 0);
});

test('with no transport it is a pure local cache (single-process default)', () => {
  const cache = fakeCache();
  const bus = createStatsBus({ cache });
  assert.equal(bus.shared, false);
  bus.invalidate(3);
  assert.deepEqual(cache.calls, [3]);
  assert.equal(bus.stats().published, 0);
});

test('setTransport upgrades a running bus once Redis connects', () => {
  const cache = fakeCache();
  const sent = [];
  const bus = createStatsBus({ cache, origin: 'w1' });
  assert.equal(bus.shared, false);

  bus.setTransport((ch, m) => sent.push(m));
  assert.equal(bus.shared, true, 'Redis connects after import, so this must be late-bindable');
  bus.invalidate(1);
  assert.equal(sent.length, 1);

  bus.setTransport(null);
  assert.equal(bus.shared, false, 'and be revocable');
});

test('onMessage applies a remote invalidation locally and does NOT re-publish', () => {
  const cache = fakeCache();
  const sent = [];
  const bus = createStatsBus({ cache, publish: (ch, m) => sent.push(m), origin: 'w1' });

  assert.equal(bus.onMessage(encodeInvalidation(9, 'w2')), true);
  assert.deepEqual(cache.calls, [9]);
  assert.equal(sent.length, 0, 'republishing would make two workers ping-pong forever');
  assert.equal(bus.stats().received, 1);
});

test('a worker ignores the echo of its own publish', () => {
  const cache = fakeCache();
  const bus = createStatsBus({ cache, publish: () => {}, origin: 'w1' });
  assert.equal(bus.onMessage(encodeInvalidation(4, 'w1')), false);
  assert.deepEqual(cache.calls, [], 'already invalidated locally when it published');
  assert.equal(bus.stats().ignored, 1);
});

test('onMessage never throws on garbage (it runs inside a Redis callback)', () => {
  const cache = fakeCache();
  const bus = createStatsBus({ cache, publish: () => {}, origin: 'w1' });
  for (const junk of ['', 'not json', '{}', '[]', 'null', '{"u":"abc"}', '{"x":1}', '{"u":{}}']) {
    assert.doesNotThrow(() => bus.onMessage(junk), `threw on ${junk}`);
    assert.equal(bus.onMessage(junk), false, `${junk} should be ignored`);
  }
  assert.deepEqual(cache.calls, [], 'no bogus invalidation from malformed input');
});

test('a null userId (unattributable write) propagates as clear-everything', () => {
  const cache = fakeCache();
  const sent = [];
  const bus = createStatsBus({ cache, publish: (ch, m) => sent.push(m), origin: 'w1' });
  bus.invalidate(null);
  assert.deepEqual(cache.calls, [null]);
  // The remote side must also read it as null, not as 0 or NaN.
  const other = createStatsBus({ cache: fakeCache(), origin: 'w2' });
  assert.equal(other.onMessage(sent[0]), true);
  assert.equal(decodeInvalidation(sent[0]).userId, null);
});

test('encode/decode round-trips string ids as numbers (req.user.uid is text)', () => {
  assert.deepEqual(decodeInvalidation(encodeInvalidation('42', 'w1')), { userId: 42, origin: 'w1' });
  assert.deepEqual(decodeInvalidation(encodeInvalidation(42, 'w1')), { userId: 42, origin: 'w1' });
});

test('two buses stay coherent through a simulated Redis channel', () => {
  // End-to-end shape of the real wiring: publish on one, deliver to both.
  const cacheA = fakeCache(), cacheB = fakeCache();
  const channel = [];
  const busA = createStatsBus({ cache: cacheA, publish: (ch, m) => channel.push(m), origin: 'A' });
  const busB = createStatsBus({ cache: cacheB, publish: (ch, m) => channel.push(m), origin: 'B' });
  const deliver = () => { for (const m of channel.splice(0)) { busA.onMessage(m); busB.onMessage(m); } };

  busA.invalidate(5);          // worker A handled the write
  deliver();
  assert.deepEqual(cacheA.calls, [5], 'A invalidated locally, once');
  assert.deepEqual(cacheB.calls, [5], 'B invalidated via the bus');

  busB.invalidate(6);
  deliver();
  assert.deepEqual(cacheA.calls, [5, 6]);
  assert.deepEqual(cacheB.calls, [5, 6]);
  assert.equal(channel.length, 0, 'converged — no endless echo');
});

test('origins are unique per worker', () => {
  assert.notEqual(newOrigin(), newOrigin());
});
