import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Email verification + password reset. Like test/password-auth.test.js, the
// properties that make these routes safe are pinned at the source level —
// this repo has no DB-backed route harness, and CI has no Postgres.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const auth = read('../src/platform/auth/auth.js');
const tokens = read('../src/platform/auth/tokens.js');
const migration = read('../db/migrations/0024_email_verification_and_reset.sql');

// The body of one route handler, so an assertion can't match a neighbouring one.
function route(method, path) {
  const start = auth.indexOf(`app.${method}('${path}'`);
  assert.notEqual(start, -1, `${method.toUpperCase()} ${path} not found`);
  const rest = auth.slice(start + 10);
  const end = rest.indexOf('\n  app.');
  return rest.slice(0, end === -1 ? undefined : end);
}

test('forgot-password is not an account-existence oracle', () => {
  const forgot = route('post', '/api/auth/password/forgot');
  // One response object, returned on every path: bad shape, unknown address,
  // and success all come back identical.
  assert.match(forgot, /const ok = \{ ok: true \};/);
  assert.equal((forgot.match(/return ok;/g) || []).length, 3);
  assert.ok(!/reply\.code\(4\d\d\)/.test(forgot), 'no error status may distinguish the cases');

  // And not by timing either: SES latency on the found path would be a visible
  // difference, so the send is deliberately not awaited.
  assert.match(forgot, /void sendPasswordResetMail\(/);
});

test('a Google-only account can still get a reset link', () => {
  // This is the documented way back for someone whose password was revoked by
  // the Google-link rule. Refusing them would leave no route at all.
  const forgot = route('post', '/api/auth/password/forgot');
  assert.match(forgot, /hasPassword: Boolean\(row\.password_hash\)/);
  assert.ok(!/password_hash IS NOT NULL/.test(forgot), 'the lookup must not filter out Google accounts');
});

test('reset validates the new password BEFORE burning the single-use token', () => {
  const reset = route('post', '/api/auth/password/reset');
  const validateAt = reset.indexOf('passwordProblem(password)');
  const consumeAt = reset.indexOf('consumeToken(');
  assert.ok(validateAt !== -1 && consumeAt !== -1);
  assert.ok(validateAt < consumeAt, 'a typo must not cost the user another email');
  // A malformed token never reaches the database.
  assert.ok(reset.indexOf('isTokenShaped(token)') < consumeAt);
});

test('reset revokes every session issued before it', () => {
  const reset = route('post', '/api/auth/password/reset');
  // The reason a reset exists is that someone else may hold a session; a
  // stateless JWT survives a password change unless the epoch moves.
  assert.match(reset, /session_epoch = session_epoch \+ 1/);
  // ...and the cache must be cleared before the new cookie is minted, or that
  // cookie carries the pre-bump epoch and is rejected by its own check.
  const dropAt = reset.indexOf('revokeSessions(uid)');
  const startAt = reset.indexOf('startSession(reply, rows[0])');
  assert.ok(dropAt !== -1 && startAt !== -1);
  assert.ok(dropAt < startAt, 'revokeSessions must precede startSession');
});

test('requireAuth enforces the epoch, and fails open when the DB is down', () => {
  const guard = auth.slice(auth.indexOf("app.decorate('requireAuth'"), auth.indexOf('equalizeTiming().catch'));
  assert.match(guard, /if \(!\(await isSessionCurrent\(req\.user, req\.log\)\)\)/);
  assert.match(guard, /reply\.code\(401\)\.send\(\{ error: 'session expired' \}\)/);
  // Pre-existing tokens carry no `se`; every existing row starts at epoch 0, so
  // they must keep working rather than logging the whole user base out.
  assert.match(auth, /Number\(payload\.se \?\? 0\)/);
  // Degrade, don't die: an unreachable Postgres must not log everyone out.
  const check = auth.slice(auth.indexOf('export async function isSessionCurrent'));
  assert.match(check, /catch \(err\) \{[\s\S]*?log\?\.error[\s\S]*?return true;/);
});

test('THE SOCKET HANDSHAKE ENFORCES THE SAME EPOCH — one implementation, two callers', () => {
  // The handshake is the only place outside requireAuth that authenticates a
  // session cookie. Verifying the signature there without the epoch check would
  // leave a revoked cookie streaming the victim's trades and prop alerts for the
  // JWT's full 30-day life — while every HTTP route 401s — which is precisely
  // what the reset flow promises to stop.
  const appjs = read('../src/app.js');
  const handshake = appjs.slice(appjs.indexOf("io.on('connection'"), appjs.indexOf('const emitTrade'));
  assert.match(handshake, /const payload = app\.jwt\.verify\(token\)/);
  assert.match(handshake, /if \(!\(await isSessionCurrent\(payload, app\.log\)\)\) throw new Error\('session revoked'\)/);
  const verifyAt = handshake.indexOf('app.jwt.verify');
  const checkAt = handshake.indexOf('isSessionCurrent');
  const joinAt = handshake.indexOf('socket.join');
  assert.ok(verifyAt < checkAt && checkAt < joinAt, 'the check must run before any room is joined');

  // And there must be exactly ONE implementation of the rule — a second copy is
  // a second thing to forget.
  assert.equal((auth.match(/export async function isSessionCurrent/g) || []).length, 1);
  assert.equal((appjs.match(/jwt\.verify|jwtVerify/g) || []).length, 1,
    'a new JWT verification site must also enforce the epoch');
});

test('revocation also closes sockets that are already connected', () => {
  // Refusing the cookie at the handshake only stops the NEXT connection.
  assert.match(auth, /function revokeSessions\(uid\) \{\s*\n\s*dropSessionEpoch\(uid\);/);
  assert.match(read('../src/app.js'),
    /setRevocationHandler\(\(uid\) => io\.in\(`user:\$\{uid\}`\)\.disconnectSockets\(true\)\)/);
  // A failed disconnect must not undo the local drop or bubble into the route.
  assert.match(auth, /revocationHandler\?\.\(Number\(uid\)\);\s*\n\s*\} catch \{/);
});

test('the squatter revoke happens AFTER the commit, not inside the transaction', () => {
  // Called mid-transaction, a concurrent request from the squatter could read
  // the pre-bump epoch and re-cache it for the full 60s TTL — reinstating the
  // session that was just revoked.
  const fn = auth.slice(auth.indexOf('async function findOrCreateUser'), auth.indexOf('async function createPasswordUser'));
  assert.match(fn, /if \(squatted\) revoked = squatterId;/);
  const commitAt = fn.indexOf("await client.query('COMMIT')");
  const revokeAt = fn.indexOf('if (revoked) revokeSessions(revoked);');
  assert.ok(commitAt !== -1 && revokeAt !== -1);
  assert.ok(commitAt < revokeAt, 'revokeSessions must run after COMMIT');
});

test('an emailed token never survives in the URL', () => {
  // A reset token is one POST from a new password and a session. Left in
  // window.location it reaches Sentry (which is on in every prod build, samples
  // pageloads, and does NOT redact URLs), browser history, and proxy logs — so
  // the backend's hash-only storage rule would be undone by the frontend.
  const strip = read('../frontend/src/features/auth/takeTokenFromUrl.js');
  assert.match(strip, /url\.searchParams\.delete\('token'\)/);
  assert.match(strip, /window\.history\.replaceState/);

  for (const screen of ['ResetPassword', 'VerifyEmail']) {
    const src = read(`../frontend/src/features/auth/${screen}.jsx`);
    assert.match(src, /useState\(takeTokenFromUrl\)/,
      `${screen} must lift the token out of the URL once, on mount`);
    // Reading it from the router each render would put it back in play and
    // return empty after the strip.
    assert.ok(!src.includes('useSearchParams'), `${screen} must not re-read the query string`);
  }

  // Defence in depth: scrub it from Sentry payloads too, in case a token reaches
  // a URL by some other route.
  const main = read('../frontend/src/main.jsx');
  assert.match(main, /replace\(\/\(\[\?&\]token=\)\[\^&\]\*\/gi, '\$1\[redacted\]'\)/);
  assert.match(main, /beforeSend: scrub/);
  assert.match(main, /beforeSendTransaction: scrub/);
});

test('the epoch check cannot become a per-request query', () => {
  // requireAuth runs on every authenticated request and this project's standing
  // bar is >=1000 concurrent users.
  assert.match(auth, /const EPOCH_TTL_MS = 60_000;/);
  assert.match(auth, /const hit = epochCache\.get\(uid\);\s*\n\s*if \(hit && Date\.now\(\) - hit\.at < EPOCH_TTL_MS\) return hit\.epoch;/);
  // Bounded, so a long-lived process can't grow the map without limit.
  assert.match(auth, /if \(epochCache\.size >= EPOCH_CACHE_MAX\) epochCache\.clear\(\);/);
});

test('a Google link that revokes a squatted password also evicts its sessions', () => {
  // Clearing password_hash leaves the squatter's existing cookie working, which
  // defeats the revoke.
  assert.match(auth, /session_epoch = session_epoch\s*\n\s*\+ CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END/);
  assert.match(auth, /if \(squatted\) revoked = squatterId;/);
  assert.match(auth, /if \(revoked\) revokeSessions\(revoked\);/);
});

test('verification: resend is authenticated, confirm grants no session', () => {
  const request = route('post', '/api/auth/verify/request');
  // Reads the address from the session, never the body — otherwise it is an
  // open relay for mailing anyone on our domain's reputation.
  assert.match(request, /preHandler: app\.requireAuth/);
  assert.ok(!request.includes('req.body'), 'the address must come from the session');

  const confirm = route('post', '/api/auth/verify/confirm');
  assert.ok(!confirm.includes('preHandler'), 'the link is opened from an inbox, often signed out');
  assert.ok(!confirm.includes('startSession'),
    'a 24h link sitting in an inbox must not be a login credential');
  assert.match(confirm, /email_verified_at = COALESCE\(email_verified_at, now\(\)\)/);
});

test('google logins and completed resets both count as verified', () => {
  // Google asserts email_verified on the ID token, which auth.js already
  // requires — a stronger check than our own mail round-trip. And redeeming a
  // reset link proves inbox control just as well as the verify flow does.
  assert.equal((auth.match(/email_verified_at = COALESCE\(email_verified_at, now\(\)\)/g) || []).length, 4);
  assert.match(auth, /INSERT INTO users \(google_sub, email, name, picture, email_verified_at\)\s*\n\s*VALUES \(\$1, \$2, \$3, \$4, now\(\)\)/);
});

test('signup mails a verification link without being able to fail on it', () => {
  const signup = route('post', '/api/auth/signup');
  assert.match(signup, /void mailVerification\(user, req\.log\)/);
  // mailVerification swallows its own failures, so `void` cannot leave an
  // unhandled rejection behind.
  assert.match(auth, /async function mailVerification[\s\S]*?catch \(err\) \{[\s\S]*?return \{ sent: false, reason: 'error' \};/);
});

test('every rate limit on the new routes is tighter than the global cap', () => {
  const limits = {
    '/api/auth/verify/request': /max: 5, timeWindow: '1 hour'/,
    '/api/auth/verify/confirm': /max: 20, timeWindow: '1 hour'/,
    '/api/auth/password/forgot': /max: 5, timeWindow: '1 hour'/,
    '/api/auth/password/reset': /max: 10, timeWindow: '1 hour'/,
  };
  for (const [path, re] of Object.entries(limits)) {
    assert.match(route('post', path), re, `${path} needs its own rate limit`);
  }
});

test('tokens are single-use by construction, not by check-then-write', () => {
  // Two requests racing the same link both run this UPDATE; row locking means
  // exactly one sees used_at IS NULL. A SELECT-then-UPDATE would let a leaked
  // link be redeemed twice.
  assert.match(tokens, /UPDATE auth_tokens\s*\n\s*SET used_at = now\(\)\s*\n\s*WHERE token_hash = \$1[\s\S]*?AND used_at IS NULL[\s\S]*?AND expires_at > now\(\)[\s\S]*?RETURNING user_id;/);
  assert.ok(!/SELECT[\s\S]*?FROM auth_tokens/.test(tokens), 'no read-then-write path');
  // Issuing burns the previous link of the same kind, so "resend" refreshes the
  // window instead of widening it.
  assert.match(tokens, /DELETE FROM auth_tokens\s*\n\s*WHERE user_id = \$1 AND \(kind = \$2 OR expires_at < now\(\)\)/);
});

test('the plaintext token never reaches the database', () => {
  assert.match(tokens, /hashToken\(token\)/);
  // Every parameter binding of a token is the hash, never the token itself.
  assert.ok(!/\[\s*token\s*[,\]]/.test(tokens), 'a raw token must never be a query parameter');
});

test('migration backfills only the addresses Google already proved', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ/);
  assert.match(migration, /SET email_verified_at = created_at[\s\S]*?WHERE email_verified_at IS NULL[\s\S]*?AND google_sub IS NOT NULL/);
  // Password-only accounts stay NULL — they are the population the column exists
  // to distinguish, so backfilling them would defeat the whole migration.
  assert.ok(!/SET email_verified_at = now\(\)\s*;/.test(migration));
  assert.match(migration, /ADD COLUMN IF NOT EXISTS session_epoch INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /token_hash TEXT\s+NOT NULL UNIQUE/);
  assert.match(migration, /CHECK \(kind IN \('verify', 'reset'\)\)/);
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/);
});

test('password_hash still cannot reach a client through the widened column list', () => {
  // USER_COLS grew by email_verified_at in this change; re-assert the invariant.
  const cols = auth.match(/const USER_COLS = '([^']+)'/);
  assert.ok(cols && !cols[1].includes('password_hash'));
  assert.match(auth, /const PROFILE_COLS = `\$\{USER_COLS\}, created_at, last_login_at`/);
  assert.ok(!auth.includes('SELECT * FROM users'));
});
