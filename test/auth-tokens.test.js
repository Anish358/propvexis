import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESET, TOKEN_TTL_MS, VERIFY,
  hashToken, isTokenShaped, mintToken, tokenExpiry,
} from '../src/platform/auth/tokens.js';

// The pure half of the emailed-link machinery. issueToken/consumeToken need a
// database and are pinned at the source level in email-auth.test.js instead.

test('tokens are unguessable and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(mintToken());
  assert.equal(seen.size, 200, 'every token must be distinct');
  // 32 random bytes, base64url — 43 characters, no padding, URL-safe so a mail
  // client cannot mangle it and no escaping is needed in the link.
  const token = mintToken();
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test('only the hash is ever stored, and it is stable', () => {
  const token = mintToken();
  const hash = hashToken(token);
  assert.equal(hash, hashToken(token), 'hashing must be deterministic — it is the lookup key');
  assert.notEqual(hash, token);
  assert.ok(!hash.includes(token), 'the plaintext must not survive inside the hash');
  assert.match(hash, /^[0-9a-f]{64}$/);                    // sha256, hex
  assert.notEqual(hashToken(mintToken()), hash);
});

test('shape check rejects what cannot be one of ours', () => {
  assert.ok(isTokenShaped(mintToken()));
  for (const bad of [
    '', 'short', null, undefined, 42, {},
    'a'.repeat(65),                                        // over the length bound
    `${mintToken()}/../../etc/passwd`,                     // path characters
    "' OR 1=1--",
    `${mintToken()} `,                                     // trailing space
  ]) {
    assert.equal(isTokenShaped(bad), false, `must reject ${JSON.stringify(bad)}`);
  }
});

test('a reset link dies much sooner than a verification link', () => {
  // A reset link is a live credential for the account; a verification link
  // grants nothing. The gap between them is the whole point.
  assert.ok(TOKEN_TTL_MS[RESET] < TOKEN_TTL_MS[VERIFY]);
  assert.equal(TOKEN_TTL_MS[RESET], 60 * 60 * 1000);
  assert.equal(TOKEN_TTL_MS[VERIFY], 24 * 60 * 60 * 1000);
});

test('expiry is absolute, computed from the supplied clock', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  assert.equal(tokenExpiry(RESET, now).toISOString(), '2026-01-01T13:00:00.000Z');
  assert.equal(tokenExpiry(VERIFY, now).toISOString(), '2026-01-02T12:00:00.000Z');
  assert.throws(() => tokenExpiry('admin', now), /unknown token kind/);
});
