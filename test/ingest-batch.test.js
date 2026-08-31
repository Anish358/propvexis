import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH_LIMIT, splitBatch } from '../src/domain/trades/batch.js';

test('BATCH_LIMIT is 500 — sized in the spec against a ~250KB body', () => {
  assert.equal(BATCH_LIMIT, 500);
});

test('splitBatch chunks a long run into BATCH_LIMIT-sized pieces', () => {
  const trades = Array.from({ length: 1201 }, (_, i) => ({ mt5_ticket: i }));
  const chunks = splitBatch(trades);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.length), [500, 500, 201]);
});

test('splitBatch returns nothing for an empty input rather than one empty chunk', () => {
  assert.deepEqual(splitBatch([]), []);
});

test('splitBatch preserves order and loses nothing', () => {
  const trades = Array.from({ length: 1201 }, (_, i) => ({ mt5_ticket: i }));
  const flat = splitBatch(trades).flat();
  assert.equal(flat.length, 1201);
  assert.deepEqual(flat.map((t) => t.mt5_ticket), trades.map((t) => t.mt5_ticket));
});
