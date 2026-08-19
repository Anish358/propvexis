import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateKey,
  parseKey,
  secretboxEnabled,
  seal,
  open,
} from '../src/platform/secretbox.js';

// The MT5 investor password is the first secret in this codebase that must be
// read back rather than verified, so these tests pin the properties that make
// that safe: it decrypts, it fails loudly when touched, and a ciphertext cannot
// be moved between accounts.

const KEY = generateKey();
const OTHER_KEY = generateKey();
const PW = 'inv3stor-p@ssword';

test('seals and opens a round trip', () => {
  assert.equal(open(seal(PW, KEY), KEY), PW);
});

test('the sealed value never contains the plaintext', () => {
  const sealed = seal(PW, KEY, '7');
  assert.ok(!sealed.includes(PW));
  // Nor as base64 of the plaintext — a "seal" that just encodes would pass the
  // check above.
  assert.ok(!sealed.includes(Buffer.from(PW).toString('base64url')));
});

test('the same plaintext seals differently every time (fresh IV)', () => {
  // IV reuse under one key is the classic GCM footgun; two identical seals would
  // be the visible symptom.
  assert.notEqual(seal(PW, KEY), seal(PW, KEY));
});

test('a wrong key cannot open it', () => {
  assert.throws(() => open(seal(PW, KEY), OTHER_KEY));
});

test('a tampered ciphertext throws instead of returning garbage', () => {
  const [v, iv, tag, ct] = seal(PW, KEY).split('.');
  const flipped = Buffer.from(ct, 'base64url');
  flipped[0] ^= 0xff;
  assert.throws(() => open([v, iv, tag, flipped.toString('base64url')].join('.'), KEY));
});

test('a tampered auth tag throws', () => {
  const [v, iv, tag, ct] = seal(PW, KEY).split('.');
  const flipped = Buffer.from(tag, 'base64url');
  flipped[0] ^= 0xff;
  assert.throws(() => open([v, iv, flipped.toString('base64url'), ct].join('.'), KEY));
});

test('a ciphertext is bound to its account and cannot be replayed into another', () => {
  // This is the property that stops one account's sync from being pointed at
  // another account's password by a row-level write.
  const sealed = seal(PW, KEY, 'account:11');
  assert.equal(open(sealed, KEY, 'account:11'), PW);
  assert.throws(() => open(sealed, KEY, 'account:12'));
  assert.throws(() => open(sealed, KEY)); // and not without the binding at all
});

test('an unknown version is refused rather than guessed at', () => {
  const parts = seal(PW, KEY).split('.');
  parts[0] = 'v2';
  assert.throws(() => open(parts.join('.'), KEY), /unsupported version/);
});

test('malformed values are refused', () => {
  for (const bad of ['', 'nope', 'v1.a.b', 'v1.a.b.c.d']) {
    assert.throws(() => open(bad, KEY));
  }
});

test('parseKey requires exactly 32 bytes, in base64 or hex', () => {
  assert.equal(parseKey(KEY).length, 32);
  assert.equal(parseKey(Buffer.from(parseKey(KEY)).toString('hex')).length, 32);
  assert.throws(() => parseKey(''), /no key configured/);
  assert.throws(() => parseKey('c2hvcnQ='), /must be 32 bytes/); // 'short'
});

test('unconfigured is a reportable state, not a crash', () => {
  assert.equal(secretboxEnabled(KEY), true);
  assert.equal(secretboxEnabled(''), false);
  assert.equal(secretboxEnabled(undefined), false);
  assert.equal(secretboxEnabled('too-short'), false);
});
