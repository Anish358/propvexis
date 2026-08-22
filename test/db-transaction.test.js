import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../src/platform/db.js';

// A fake pg client that records the SQL it was handed, in order, so the
// BEGIN/COMMIT/ROLLBACK/release contract is assertable without a database.
function fakeClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    query: overrides.query || (async (text) => { calls.push(text); return { rows: [] }; }),
    release: () => { calls.push('RELEASE'); },
  };
}

test('withTransaction: BEGIN, body, COMMIT, then release — in that order', async () => {
  const c = fakeClient();
  const out = await withTransaction(async (client) => {
    await client.query('INSERT 1');
    return 'result';
  }, async () => c);
  assert.equal(out, 'result');
  assert.deepEqual(c.calls, ['BEGIN', 'INSERT 1', 'COMMIT', 'RELEASE']);
});

test('withTransaction: rolls back and still releases when the body throws', async () => {
  const c = fakeClient();
  await assert.rejects(
    () => withTransaction(async () => { throw new Error('boom'); }, async () => c),
    /boom/,
  );
  assert.deepEqual(c.calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('withTransaction: a failing ROLLBACK does not mask the original error', async () => {
  // A dead connection makes ROLLBACK throw too. The caller must still see the
  // real cause, not "connection terminated" — that is the difference between a
  // debuggable 500 and a mystery.
  const calls = [];
  const c = {
    calls,
    query: async (text) => {
      calls.push(text);
      if (text === 'ROLLBACK') throw new Error('connection terminated');
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  await assert.rejects(
    () => withTransaction(async () => { throw new Error('the real cause'); }, async () => c),
    /the real cause/,
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('withTransaction: the client is released even when COMMIT throws', async () => {
  const calls = [];
  const c = {
    query: async (text) => {
      calls.push(text);
      if (text === 'COMMIT') throw new Error('commit failed');
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  await assert.rejects(() => withTransaction(async () => 'x', async () => c), /commit failed/);
  assert.ok(calls.includes('RELEASE'), 'a leaked client exhausts the pool');
});
