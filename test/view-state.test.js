import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeState } from '../src/domain/journal/viewState.js';

// View state is stored server-side per user (was browser localStorage). The blob
// is client-owned + opaque, but the server fail-closes non-object input to {} so
// a malformed PUT can never persist junk that breaks the client's next hydrate.

test('sanitizeState: keeps a plain object as-is', () => {
  const s = { viewConfigs: { god: { unit: 'R' } }, tradeSettings: { beRounding: true } };
  assert.equal(sanitizeState(s), s);
});

test('sanitizeState: empty object stays {}', () => {
  assert.deepEqual(sanitizeState({}), {});
});

test('sanitizeState: non-objects coerce to {}', () => {
  for (const junk of [null, undefined, 'str', 42, true, [1, 2, 3]]) {
    assert.deepEqual(sanitizeState(junk), {}, `${JSON.stringify(junk)} should coerce to {}`);
  }
});
