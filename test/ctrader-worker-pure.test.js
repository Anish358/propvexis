import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frame, FrameReader } from '../worker/ctrader/framing.js';
import { backfillWindows, WINDOW_MS, advanceCursor } from '../worker/ctrader/windows.js';
import { HistoricalThrottle } from '../worker/ctrader/throttle.js';

// ---- framing ---------------------------------------------------------------

test('a frame is its length as a 4-byte big-endian prefix', () => {
  const out = frame(Buffer.from([0xaa, 0xbb]));
  assert.equal(out.length, 6);
  assert.equal(out.readUInt32BE(0), 2);
  assert.deepEqual([...out.subarray(4)], [0xaa, 0xbb]);
});

test('the reader reassembles a message split across TCP reads', () => {
  /* THE BUG THIS PREVENTS. TLS gives you a byte stream, not messages. Assuming
   * one 'data' event is one protobuf message works perfectly on a quiet demo
   * socket and corrupts everything the first busy minute on live, when two
   * events arrive coalesced or one is split mid-length-prefix. */
  const r = new FrameReader();
  const msg = frame(Buffer.from('hello'));
  assert.deepEqual(r.push(msg.subarray(0, 2)), [], 'half a length prefix yields nothing');
  assert.deepEqual(r.push(msg.subarray(2, 6)), [], 'still short of the payload');
  assert.deepEqual(r.push(msg.subarray(6)).map(String), ['hello']);
});

test('the reader splits two messages arriving in one read', () => {
  const r = new FrameReader();
  const both = Buffer.concat([frame(Buffer.from('one')), frame(Buffer.from('two'))]);
  assert.deepEqual(r.push(both).map(String), ['one', 'two']);
});

test('the reader keeps a trailing partial message for the next read', () => {
  const r = new FrameReader();
  const buf = Buffer.concat([frame(Buffer.from('one')), frame(Buffer.from('two')).subarray(0, 5)]);
  assert.deepEqual(r.push(buf).map(String), ['one']);
  assert.deepEqual(r.push(frame(Buffer.from('two')).subarray(5)).map(String), ['two']);
});

test('an absurd frame length is refused rather than buffered forever', () => {
  // A desynchronised stream reads garbage as a 3GB length and the reader would
  // otherwise wait for it, silently, holding the socket open and never recovering.
  const r = new FrameReader();
  const bad = Buffer.alloc(4);
  bad.writeUInt32BE(0x7fffffff, 0);
  assert.throws(() => r.push(bad), /frame/i);
});

// ---- backfill windows ------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

test('windows walk NEWEST FIRST, so recent trades land within seconds', () => {
  /* The user is never blocked on this — the wizard finishes as soon as the
   * account is provisioned. So the budget that matters is time-until-first-trade,
   * not total duration. Oldest-first would show an empty journal for minutes
   * while four years of 2022 filled in. */
  const now = 1_756_000_000_000;
  const w = backfillWindows({ now, registeredAt: now - 100 * DAY });
  assert.equal(w[0].to, now);
  assert.equal(w[0].from, now - WINDOW_MS);
  assert.ok(w[0].from > w[1].from, 'each window must be older than the last');
});

test('the walk stops at the account registration date, not before it', () => {
  const now = 1_756_000_000_000;
  const registeredAt = now - 100 * DAY;
  const w = backfillWindows({ now, registeredAt });
  assert.equal(w[w.length - 1].from, registeredAt, 'the last window floors at inception');
  assert.ok(w.every((x) => x.from >= registeredAt));
});

test('an account younger than one window produces exactly one window', () => {
  const now = 1_756_000_000_000;
  const w = backfillWindows({ now, registeredAt: now - 3 * DAY });
  assert.equal(w.length, 1);
  assert.deepEqual(w[0], { from: now - 3 * DAY, to: now });
});

test('a resumed backfill starts at the cursor, not at now', () => {
  // sync_jobs.cursor_at exists so a worker killed mid-backfill does not re-walk
  // years of history to arrive back where it already was.
  const now = 1_756_000_000_000;
  const cursor = now - 40 * DAY;
  const w = backfillWindows({ now, registeredAt: now - 400 * DAY, cursorAt: cursor });
  assert.equal(w[0].to, cursor, 'resume from the cursor');
});

test('an unknown registration date still terminates', () => {
  // registrationTimestamp comes from ProtoOATraderReq. If it is missing we must
  // not loop to 1970 one month at a time — that is 600+ requests at 5/s.
  const now = 1_756_000_000_000;
  const w = backfillWindows({ now, registeredAt: null });
  assert.ok(w.length > 0 && w.length <= 200, `bounded, got ${w.length}`);
});

test('CURSOR SAFETY: paging does not bump past a shared millisecond', () => {
  /* THE DATA-LOSS BUG THIS PREVENTS. Two deals can share an executionTimestamp.
   * Advancing to `last + 1ms` skips the second one, silently and permanently.
   * Re-reading the boundary instead is FREE because dealId is the idempotency
   * key, so the overlapping deal is a no-op at ingest. */
  assert.equal(advanceCursor(1_756_000_000_000), 1_756_000_000_000);
});

// ---- historical throttle ---------------------------------------------------

test('the historical throttle is 5/s, not the general 50/s', () => {
  // Landmine 10.6: the historical limit is 10x tighter than the general one. A
  // backfill written against 50/s earns 429s from the first window.
  const t = new HistoricalThrottle();
  assert.equal(t.limitPerSecond, 5);
});

test('the throttle spaces calls across ALL accounts on a socket', async () => {
  // Per-connection, not per-account. Firing five accounts in parallel each at
  // "5/s" is 25/s on one socket.
  const t = new HistoricalThrottle({ limitPerSecond: 5, now: () => 0 });
  const slots = [];
  for (let i = 0; i < 10; i += 1) slots.push(t.nextSlotAt());
  assert.equal(slots[0], 0);
  assert.equal(slots[4], 800, 'five calls fill the first second');
  assert.equal(slots[5], 1000, 'the sixth waits for the next second');
});

test('a server retryAfter overrides the local throttle', () => {
  // The local throttle is a guess at the limit; retryAfter on a BLOCKED_PAYLOAD_TYPE
  // error is what the server actually wants and is authoritative.
  const t = new HistoricalThrottle({ limitPerSecond: 5, now: () => 1000 });
  t.blockUntil(1000 + 30_000);
  assert.ok(t.nextSlotAt() >= 31_000, 'must respect the server over our own spacing');
});
