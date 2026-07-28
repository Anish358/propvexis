import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The password routes touch credentials, so the properties that make them safe
// are pinned here at the source level (this repo has no DB-backed route
// harness). The hashing itself is covered by test/credentials.test.js.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const auth = read('../src/auth.js');
const migration = read('../db/migrations/0021_password_auth.sql');

// The body of one route handler, so assertions can't accidentally match another.
function route(method, path) {
  const start = auth.indexOf(`app.${method}('${path}'`);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${path} not found`);
  const rest = auth.slice(start + 10);
  const end = rest.indexOf('\n  app.');
  return rest.slice(0, end === -1 ? undefined : end);
}

test('password_hash can never reach a client', () => {
  // The shared column list is explicit and excludes it...
  const cols = auth.match(/const USER_COLS = '([^']+)'/);
  assert.ok(cols, 'USER_COLS must be declared');
  assert.ok(!cols[1].includes('password_hash'));
  assert.ok(!auth.includes('SELECT * FROM users'), 'never SELECT * off the users table');
  // ...and the one query that does read the hash strips it before returning.
  assert.match(route('post', '/api/auth/login'), /const \{ password_hash: _ignored, \.\.\.user \} = row/);
});

test('login is not an account-existence oracle', () => {
  const login = route('post', '/api/auth/login');
  // Exactly one user-facing failure message, reused by every failure path.
  const messages = [...login.matchAll(/error: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(messages)], ['Email or password is incorrect.']);
  // Missing input, no-password account, wrong password — all three exit the
  // same way, so there is nothing to diff between them.
  assert.equal((login.match(/return invalid\(\);/g) || []).length, 3);
  // An unknown email (or a Google-only account) still pays the scrypt cost, so
  // response timing doesn't leak which addresses are registered.
  assert.match(login, /if \(!row\?\.password_hash\) \{\s*await equalizeTiming\(\);/);
});

test('signup validates, gates on the allowlist, and cannot race a duplicate', () => {
  const signup = route('post', '/api/auth/signup');
  assert.match(signup, /isEmailShaped\(email\)/);
  assert.match(signup, /passwordProblem\(password\)/);
  assert.match(signup, /isEmailPermitted\(email, config\)/);   // same gate as Google
  assert.match(signup, /await hashPassword\(password\)/);
  assert.ok(!signup.includes('req.body.password,'), 'never store the raw password');
  // Uniqueness is enforced by the INSERT, not a read-then-write.
  assert.match(auth, /ON CONFLICT \(email\) DO NOTHING/);
});

test('linking a Google account by email revokes an unverified password', () => {
  // Signup accepts any address without proving ownership, so a row found by
  // email may have been seeded by someone squatting it. Google has just proven
  // ownership; the password never was — so the link must clear it, or the
  // squatter keeps password access to the real owner's account.
  const link = auth.slice(
    auth.indexOf('maybe a pre-seeded row exists'),
    auth.indexOf('INSERT INTO users (google_sub')
  );
  assert.match(link, /SET google_sub = \$2[\s\S]*?password_hash = NULL/);
  assert.match(link, /SELECT id, password_hash FROM users WHERE email = \$1 FOR UPDATE/);
  assert.match(link, /revoking unverified password on google link/);
});

test('both credential routes are rate-limited below the global cap', () => {
  for (const [path, max] of [['/api/auth/signup', 10], ['/api/auth/login', 20]]) {
    assert.match(route('post', path), new RegExp(`rateLimit: \\{ max: ${max}, timeWindow:`));
  }
});

test('passwords are never logged', () => {
  const logged = [...auth.matchAll(/req\.log\.\w+\(\{([^}]*)\}/g)].map((m) => m[1]);
  for (const fields of logged) {
    assert.ok(!/password/i.test(fields), `log payload leaks a password field: ${fields}`);
  }
});

test('migration makes room for password-only accounts without weakening identity', () => {
  assert.match(migration, /ALTER COLUMN google_sub DROP NOT NULL/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS password_hash TEXT/);
  // A row with neither identity could never log in — rejected at the DB level.
  assert.match(migration, /CHECK \(google_sub IS NOT NULL OR password_hash IS NOT NULL\)/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS users_has_auth_method/); // re-runnable
});
