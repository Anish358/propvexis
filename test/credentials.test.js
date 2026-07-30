import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  hashPassword,
  isEmailShaped,
  normalizeEmail,
  passwordProblem,
  verifyPassword,
} from '../src/credentials.js';

// scrypt at these cost parameters is ~100ms a call by design, so keep the number
// of hashes here small.

test('hash → verify round-trips, and only for the right password', async () => {
  const hash = await hashPassword('a decent passphrase');
  assert.equal(await verifyPassword('a decent passphrase', hash), true);
  assert.equal(await verifyPassword('a decent passphras', hash), false);
  assert.equal(await verifyPassword('A decent passphrase', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('the stored format is self-describing and carries no plaintext', async () => {
  const hash = await hashPassword('another good one');
  const parts = hash.split('$');
  assert.equal(parts.length, 6);
  assert.equal(parts[0], 'scrypt');
  assert.equal(Number(parts[1]), 32768);          // N
  assert.ok(!hash.includes('another good one'));
  // Salted: the same password hashes differently every time.
  assert.notEqual(hash, await hashPassword('another good one'));
});

test('verify never throws on a malformed or foreign stored value', async () => {
  for (const stored of ['', 'garbage', 'scrypt$1$2$3', 'bcrypt$2b$10$abc',
    'scrypt$x$8$1$c2FsdA==$aGFzaA==', 'scrypt$32768$8$1$$', null, undefined, 42]) {
    assert.equal(await verifyPassword('whatever', stored), false, `stored=${String(stored)}`);
  }
});

test('an over-long password is rejected without hashing it', async () => {
  const hash = await hashPassword('the real password');
  assert.equal(await verifyPassword('x'.repeat(PASSWORD_MAX + 1), hash), false);
  assert.match(passwordProblem('x'.repeat(PASSWORD_MAX + 1)), /at most/);
});

test('password policy: length floor, blocklist, whitespace-only', () => {
  assert.equal(passwordProblem('correct horse'), null);
  assert.match(passwordProblem(''), /Enter a password/);
  assert.match(passwordProblem('short'), new RegExp(`at least ${PASSWORD_MIN}`));
  assert.match(passwordProblem('        '), /Enter a password/);
  assert.match(passwordProblem('password123'), /too common/);
  assert.match(passwordProblem('PASSWORD123'), /too common/);   // case-insensitive
  assert.match(passwordProblem(undefined), /Enter a password/);
});

test('hashPassword refuses to hash something the policy rejects', async () => {
  await assert.rejects(() => hashPassword('short'), /weak password/);
});

test('emails are normalized and shape-checked', () => {
  assert.equal(normalizeEmail('  Anish@Example.COM '), 'anish@example.com');
  assert.equal(normalizeEmail(undefined), '');
  for (const ok of ['a@b.co', 'first.last+tag@sub.domain.io']) {
    assert.equal(isEmailShaped(ok), true, ok);
  }
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'a@@b.co', `${'x'.repeat(250)}@b.co`]) {
    assert.equal(isEmailShaped(bad), false, bad);
  }
});
