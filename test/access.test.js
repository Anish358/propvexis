import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmailPermitted } from '../src/access.js';

test('open signup admits any email', () => {
  const cfg = { openSignup: true, allowedEmails: [] };
  assert.equal(isEmailPermitted('anyone@example.com', cfg), true);
  assert.equal(isEmailPermitted('someone.else@gmail.com', cfg), true);
});

test('allowlist mode admits only listed emails (fail closed on empty)', () => {
  assert.equal(
    isEmailPermitted('a@x.com', { openSignup: false, allowedEmails: [] }),
    false,
    'empty allowlist denies everyone',
  );
  const cfg = { openSignup: false, allowedEmails: ['a@x.com'] };
  assert.equal(isEmailPermitted('a@x.com', cfg), true);
  assert.equal(isEmailPermitted('b@x.com', cfg), false);
});

test('allowlist match is case-insensitive on the incoming email', () => {
  const cfg = { openSignup: false, allowedEmails: ['a@x.com'] };
  assert.equal(isEmailPermitted('A@X.com', cfg), true);
});

test('missing email is denied when not open signup', () => {
  assert.equal(isEmailPermitted('', { openSignup: false, allowedEmails: [] }), false);
  assert.equal(isEmailPermitted(undefined, { openSignup: false, allowedEmails: [] }), false);
});
