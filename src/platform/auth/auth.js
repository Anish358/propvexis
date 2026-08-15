import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { isEmailPermitted } from './access.js';
import { needsOnboarding } from './onboarding.js';
import { pool, query } from '../db.js';
import {
  equalizeTiming,
  hashPassword,
  isEmailShaped,
  normalizeEmail,
  passwordProblem,
  verifyPassword,
} from './credentials.js';
import { sendPasswordResetMail, sendVerificationMail } from './authMail.js';
import { RESET, VERIFY, consumeToken, isTokenShaped, issueToken } from './tokens.js';

const COOKIE_NAME = 'session';
// Columns every auth route returns to the client. Never widen this to `*` —
// password_hash lives on the same row.
const USER_COLS = 'id, email, name, picture, plan, onboarded_at, email_verified_at';
// The fuller profile /api/auth/me returns. Same rule as USER_COLS: enumerated,
// never `*`.
const PROFILE_COLS = `${USER_COLS}, created_at, last_login_at`;
const googleClient = new OAuth2Client(config.googleClientId);

// ---------------------------------------------------------------------------
// Session revocation
//
// Sessions are stateless JWTs, so a password reset cannot evict the sessions an
// attacker already holds — which is most of the point of resetting. Each token
// therefore carries the user's `session_epoch` (claim `se`), and this guard
// rejects any token whose epoch is behind the row's.
//
// The cost has to be near zero: requireAuth runs on every authenticated
// request, and this project's standing bar is >=1000 concurrent users, so a
// per-request SELECT is not acceptable. Hence the short TTL cache — one query
// per user per minute, which is noise next to the query the handler is about
// to run anyway.
// ---------------------------------------------------------------------------
const EPOCH_TTL_MS = 60_000;
// Crude cap rather than an LRU: entries are ~50 bytes and expire on their own,
// so the only job here is to stop unbounded growth on a long-lived process.
const EPOCH_CACHE_MAX = 10_000;
const epochCache = new Map();

/** Forget a cached epoch, so the next request re-reads it immediately. */
export function dropSessionEpoch(uid) {
  epochCache.delete(Number(uid));
}

// Set by app.js once Socket.IO exists (io is created after registerAuth runs).
// Revocation has to reach the realtime channel too: refusing the cookie at the
// handshake only stops NEW connections, while a socket opened before the reset
// stays joined to the user's rooms and keeps streaming their trades.
let revocationHandler = null;
export function setRevocationHandler(fn) {
  revocationHandler = typeof fn === 'function' ? fn : null;
}

/**
 * Kill every session for a user: drop the cached epoch so this worker stops
 * accepting the old token immediately, then close their open sockets.
 *
 * MUST be called only after the epoch bump has COMMITTED. Called inside the
 * transaction, a concurrent request could re-read the pre-bump value and
 * re-cache it for the full TTL — reinstating the very session being revoked.
 */
function revokeSessions(uid) {
  dropSessionEpoch(uid);
  try {
    revocationHandler?.(Number(uid));
  } catch {
    // A failed disconnect must never undo the drop above, and must never
    // propagate into the auth route that triggered it.
  }
}

async function sessionEpochOf(uid) {
  const hit = epochCache.get(uid);
  if (hit && Date.now() - hit.at < EPOCH_TTL_MS) return hit.epoch;
  const { rows } = await query('SELECT session_epoch FROM users WHERE id = $1', [uid]);
  const epoch = rows.length ? Number(rows[0].session_epoch) : 0;
  if (epochCache.size >= EPOCH_CACHE_MAX) epochCache.clear();
  epochCache.set(uid, { epoch, at: Date.now() });
  return epoch;
}

/**
 * Is this verified JWT payload still a live session?
 *
 * THE ONE IMPLEMENTATION, on purpose. A signature check is not by itself an
 * authentication decision any more, and this app verifies session cookies in
 * two places — the HTTP guard below and the Socket.IO handshake in app.js. A
 * second copy of the rule is a second thing to forget: a revoked cookie that
 * still authenticated a socket would keep streaming the victim's trades and
 * alerts for the JWT's full 30-day life, which is exactly what a password reset
 * is supposed to stop.
 *
 * Tokens issued before this feature existed carry no `se`, which reads as
 * epoch 0 — correct, because every existing row starts at 0.
 *
 * Fails OPEN if Postgres is unreachable: the choice is between logging everyone
 * out of a degraded-but-working app and letting a rare revoked session live a
 * little longer. Same trade as platform/redis.js — degrade, don't die.
 */
export async function isSessionCurrent(payload, log) {
  try {
    return await sessionEpochOf(Number(payload.uid)) === Number(payload.se ?? 0);
  } catch (err) {
    log?.error({ err: err.message, uid: payload?.uid },
      'session epoch check failed — allowing session (fail-open)');
    return true;
  }
}

// Verify a Google ID token (the `credential` minted by Google Identity Services
// on the frontend) and return its trusted payload, or throw.
async function verifyGoogleIdToken(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: config.googleClientId,
  });
  return ticket.getPayload(); // { sub, email, email_verified, name, picture, ... }
}

// Find-or-create the user for a verified Google login.
// Identity key is Google's stable `sub`, but we also reconcile by email: a row
// can be pre-seeded by email with a placeholder `sub` (e.g. to assign existing
// trades to an owner before they've ever logged in); on first real login we
// link that row to the actual Google `sub`. Done in a transaction so concurrent
// logins can't create duplicates.
async function findOrCreateUser({ sub, email, name, picture }, log) {
  const client = await pool.connect();
  // Set when the link revoked a squatted password. The sessions it invalidates
  // are killed AFTER the commit, never inside the transaction — see below.
  let revoked = null;
  try {
    await client.query('BEGIN');

    let { rows } = await client.query(
      'SELECT id FROM users WHERE google_sub = $1 FOR UPDATE',
      [sub]
    );

    if (rows.length) {
      ({ rows } = await client.query(
        `UPDATE users SET email = $2, name = $3, picture = $4, last_login_at = now(),
                          email_verified_at = COALESCE(email_verified_at, now())
         WHERE id = $1 RETURNING ${USER_COLS};`,
        [rows[0].id, email, name, picture]
      ));
    } else {
      // No row for this sub — maybe a pre-seeded row exists for this email.
      ({ rows } = await client.query(
        'SELECT id, password_hash FROM users WHERE email = $1 FOR UPDATE',
        [email]
      ));
      if (rows.length) {
        // SECURITY: linking by email adopts a row this Google account has never
        // touched. Signup accepts any address without proving ownership, so that
        // row's password may have been set by someone squatting this address —
        // and it would keep working after the real owner arrives. Google has now
        // proven ownership; the password never was, so it's revoked here. The
        // owner can set a fresh one later via a (verified) reset flow.
        const squatted = Boolean(rows[0].password_hash);
        if (squatted) {
          log?.warn({ uid: Number(rows[0].id) },
            'revoking unverified password on google link (email pre-registered)');
        }
        const squatterId = Number(rows[0].id);
        ({ rows } = await client.query(
          // Revoking the password is not enough on its own: a squatter who
          // signed up with it may be holding a live session cookie right now,
          // and that session outlives the credential it came from. Bumping the
          // epoch in the same statement evicts it. The CASE reads the row's
          // pre-UPDATE password_hash, so an account that never had a password
          // keeps its epoch and its logged-in devices.
          `UPDATE users SET google_sub = $2, name = $3, picture = $4,
                            password_hash = NULL, last_login_at = now(),
                            email_verified_at = COALESCE(email_verified_at, now()),
                            session_epoch = session_epoch
                              + CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END
           WHERE id = $1 RETURNING ${USER_COLS};`,
          [squatterId, sub, name, picture]
        ));
        if (squatted) revoked = squatterId;
      } else {
        ({ rows } = await client.query(
          `INSERT INTO users (google_sub, email, name, picture, email_verified_at)
           VALUES ($1, $2, $3, $4, now()) RETURNING ${USER_COLS};`,
          [sub, email, name, picture]
        ));
      }
    }

    await client.query('COMMIT');
    // AFTER the commit, never before: a concurrent request from the squatter
    // could otherwise read the pre-bump epoch mid-transaction and re-cache it
    // for the full TTL, quietly reinstating the session this just revoked.
    if (revoked) revokeSessions(revoked);
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Create a password account. Returns the user row, or null when the email is
// already taken — the INSERT's ON CONFLICT does the check, so two simultaneous
// signups for the same address can't both succeed.
async function createPasswordUser({ email, name, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (email, name, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING ${USER_COLS};`,
    [email, name, passwordHash]
  );
  return rows[0] ?? null;
}

/**
 * Issue a verification token and mail it.
 *
 * Never rejects — every caller either fires it without awaiting (signup) or
 * reports `sent` to the user (the resend route), and neither should be able to
 * fail because the mailer or the token INSERT had a bad day.
 */
async function mailVerification(user, log) {
  try {
    const token = await issueToken({ userId: Number(user.id), kind: VERIFY });
    return await sendVerificationMail({ to: user.email, name: user.name, token }, log);
  } catch (err) {
    log?.error({ err: err.message, uid: Number(user.id) }, 'could not send verification email');
    return { sent: false, reason: 'error' };
  }
}

// Cookie attributes for the session JWT. httpOnly so JS can't read it; secure
// (HTTPS-only) in prod; SameSite=Lax works because the UI and API are served
// same-origin behind Caddy (and via the Vite dev proxy locally).
function sessionCookieOpts() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionMaxDays * 24 * 60 * 60, // seconds
  };
}

/**
 * Registers cookie + JWT plugins, the `requireAuth` guard, and the auth routes.
 * Must be awaited before any route that calls `app.requireAuth`.
 */
export async function registerAuth(app) {
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.sessionSecret,
    // Let jwtVerify() read the token from our httpOnly cookie (not just the
    // Authorization header).
    cookie: { cookieName: COOKIE_NAME, signed: false },
    sign: { expiresIn: `${config.sessionMaxDays}d` },
  });

  // preHandler guard: 401 unless a valid session cookie is present. On success
  // `req.user` holds the JWT payload ({ uid, email, name, se }).
  app.decorate('requireAuth', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'authentication required' });
    }

    // Revocation check. A token minted before the user's last password reset is
    // no longer a session, even though its signature and expiry are still good.
    if (!(await isSessionCurrent(req.user, req.log))) {
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return reply.code(401).send({ error: 'session expired' });
    }
  });

  // Build the timing-equalizer's decoy hash now: otherwise the FIRST
  // unknown-email login on a cold process pays to create it and lands ~2x
  // slower than the rest, which is exactly the signal equalizeTiming exists to
  // remove. Fire-and-forget — a failure here only affects that one request.
  equalizeTiming().catch(() => {});

  // Issue the session cookie for a user row and return the API shape. Shared by
  // every way in (Google, signup, password login, password reset).
  //
  // The epoch is read (through the cache) rather than passed in, so a caller can
  // never mint a token stamped with a stale generation. A route that has just
  // bumped the epoch must call dropSessionEpoch first — otherwise this reads the
  // pre-bump value from cache and issues a session that is dead on arrival.
  const startSession = async (reply, user) => {
    const token = await reply.jwtSign({
      uid: Number(user.id),
      email: user.email,
      name: user.name,
      se: await sessionEpochOf(Number(user.id)),
    });
    reply.setCookie(COOKIE_NAME, token, sessionCookieOpts());
    return { user };
  };

  // -------------------------------------------------------------------------
  // POST /api/auth/google — exchange a Google ID token for a session cookie.
  // -------------------------------------------------------------------------
  app.post('/api/auth/google', {
    // Tighter than the global cap: this is the credential-verification surface.
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (!config.googleClientId) {
      req.log.error('GOOGLE_CLIENT_ID is not configured');
      return reply.code(500).send({ error: 'google login not configured' });
    }
    const { credential } = req.body ?? {};
    if (!credential) return reply.code(400).send({ error: 'missing credential' });

    let payload;
    try {
      payload = await verifyGoogleIdToken(credential);
    } catch (err) {
      req.log.warn({ err: err.message }, 'google id token verification failed');
      return reply.code(401).send({ error: 'invalid google credential' });
    }

    if (!payload.email || !payload.email_verified) {
      return reply.code(401).send({ error: 'unverified google email' });
    }
    const email = payload.email.toLowerCase();

    // Access control: open signup admits any verified account; otherwise the
    // email must be on the allowlist (fail closed on empty). See access.js.
    if (!isEmailPermitted(email, config)) {
      req.log.warn({ email }, 'login rejected: email not permitted');
      return reply.code(403).send({ error: 'this account is not allowed' });
    }

    const user = await findOrCreateUser({
      sub: payload.sub,
      email,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    }, req.log);

    return startSession(reply, user);
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/signup — create an email + password account.
  //
  // Same access gate as Google: OPEN_SIGNUP admits anyone, otherwise the email
  // must be on the allowlist (fail-closed). Rate-limited hard — this route
  // both writes rows and runs scrypt.
  // -------------------------------------------------------------------------
  app.post('/api/auth/signup', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : null;

    if (!isEmailShaped(email)) return reply.code(400).send({ error: 'Enter a valid email address.' });
    const problem = passwordProblem(password);
    if (problem) return reply.code(400).send({ error: problem });

    if (!isEmailPermitted(email, config)) {
      req.log.warn({ email }, 'signup rejected: email not permitted');
      return reply.code(403).send({ error: 'Signups are invite-only right now.' });
    }

    const user = await createPasswordUser({
      email,
      name: name || null,
      passwordHash: await hashPassword(password),
    });
    if (!user) {
      // Address taken. This does confirm the address exists, which is the
      // conventional trade for a usable signup form; the login route stays
      // deliberately silent (see below).
      return reply.code(409).send({ error: 'That email already has an account — log in instead.' });
    }

    req.log.info({ uid: Number(user.id) }, 'password signup');
    // Fire-and-forget: a mail outage must not fail a signup that already
    // succeeded in the database. Verification is soft (the app is usable
    // unverified, with a banner), so the worst case is a resend from the banner.
    void mailVerification(user, req.log);
    return startSession(reply, user);
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/login — email + password.
  //
  // Every failure returns the SAME 401 body, whether the address is unknown,
  // the password is wrong, or the account is Google-only. Anything more
  // specific turns this route into an account-existence oracle. The UI carries
  // a "signed up with Google?" hint instead.
  // -------------------------------------------------------------------------
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 20, timeWindow: '5 minutes' } },
  }, async (req, reply) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const invalid = () => reply.code(401).send({ error: 'Email or password is incorrect.' });

    if (!email || typeof password !== 'string' || !password) return invalid();

    const { rows } = await query(
      `SELECT ${USER_COLS}, password_hash FROM users WHERE email = $1`,
      [email]
    );
    const row = rows[0];

    // No account, or a Google-only one: still burn the scrypt work, so response
    // time doesn't reveal which addresses are registered.
    if (!row?.password_hash) {
      await equalizeTiming();
      return invalid();
    }
    if (!(await verifyPassword(password, row.password_hash))) {
      req.log.warn({ email }, 'password login failed');
      return invalid();
    }

    const { password_hash: _ignored, ...user } = row;
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    return startSession(reply, user);
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/verify/request — (re)send the verification email.
  //
  // Authenticated, because the address is read from the session rather than the
  // body: an unauthenticated version would be an open relay for sending mail to
  // any address on our domain's reputation.
  // -------------------------------------------------------------------------
  app.post('/api/auth/verify/request', {
    preHandler: app.requireAuth,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { rows } = await query(
      `SELECT ${USER_COLS} FROM users WHERE id = $1`,
      [req.user.uid]
    );
    if (!rows.length) {
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return reply.code(401).send({ error: 'user no longer exists' });
    }
    const user = rows[0];
    if (user.email_verified_at) return { ok: true, alreadyVerified: true };

    const { sent } = await mailVerification(user, req.log);
    // `sent: false` here means the mailer is unconfigured or SES failed. Say so:
    // this route is authenticated and about the caller's own address, so there
    // is no enumeration concern, and silently claiming success would leave the
    // user waiting for mail that is never coming.
    return { ok: true, sent };
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/verify/confirm — redeem a link from that email.
  //
  // Deliberately NOT authenticated and deliberately NOT session-granting: the
  // link is opened from an inbox, often in a different browser, so requiring a
  // session would strand people — but treating the link as a login credential
  // would make a 24-hour-lived URL sitting in an inbox equivalent to a password.
  // It confirms the address and nothing else.
  // -------------------------------------------------------------------------
  app.post('/api/auth/verify/confirm', {
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const token = req.body?.token;
    const uid = await consumeToken({ token, kind: VERIFY });
    if (!uid) {
      return reply.code(400).send({ error: 'That link has expired or has already been used.' });
    }
    const { rows } = await query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
        WHERE id = $1 RETURNING email;`,
      [uid]
    );
    req.log.info({ uid }, 'email verified');
    return { ok: true, email: rows[0]?.email ?? null };
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/password/forgot — mail a reset link.
  //
  // ALWAYS returns the same 200, for any input. An unauthenticated route that
  // answered differently for a registered address would be a bulk account
  // checker, and this one takes an address as its whole input.
  //
  // A Google-only account gets a link too, rather than a refusal. That is the
  // documented way back for someone whose password was revoked by the
  // Google-link rule in findOrCreateUser — refusing would leave them with no
  // route at all, which is the gap this route exists to close.
  // -------------------------------------------------------------------------
  app.post('/api/auth/password/forgot', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const email = normalizeEmail(req.body?.email);
    const ok = { ok: true };
    if (!isEmailShaped(email)) return ok;

    const { rows } = await query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const row = rows[0];
    if (!row) {
      req.log.info({ email }, 'password reset requested for unknown address');
      return ok;
    }

    const token = await issueToken({ userId: Number(row.id), kind: RESET });
    // Not awaited: SES latency is measurable and would make a registered
    // address answer visibly slower than an unregistered one, reintroducing by
    // timing exactly the oracle the identical response body removes. sendMail
    // never rejects and logs its own failures.
    void sendPasswordResetMail({
      to: row.email,
      name: row.name,
      token,
      hasPassword: Boolean(row.password_hash),
    }, req.log);
    req.log.info({ uid: Number(row.id) }, 'password reset link issued');
    return ok;
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/password/reset — redeem the link and set a new password.
  // -------------------------------------------------------------------------
  app.post('/api/auth/password/reset', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const token = req.body?.token;
    const password = req.body?.password;

    if (!isTokenShaped(token)) {
      return reply.code(400).send({ error: 'That link has expired or has already been used.' });
    }
    // Validate BEFORE redeeming. Tokens are single-use, so checking the password
    // afterwards would burn the link on a typo and force another email.
    const problem = passwordProblem(password);
    if (problem) return reply.code(400).send({ error: problem });

    const uid = await consumeToken({ token, kind: RESET });
    if (!uid) {
      return reply.code(400).send({ error: 'That link has expired or has already been used.' });
    }

    const { rows } = await query(
      // Three things at once, all of which must be true afterwards:
      //   - the new password is live;
      //   - every session issued before this moment is dead (the reason a reset
      //     exists is that someone else may hold one);
      //   - the address counts as verified — redeeming this link proved control
      //     of the inbox, which is a stronger check than the verify flow's.
      `UPDATE users
          SET password_hash = $2,
              session_epoch = session_epoch + 1,
              email_verified_at = COALESCE(email_verified_at, now()),
              last_login_at = now()
        WHERE id = $1
      RETURNING ${USER_COLS};`,
      [uid, await hashPassword(password)]
    );
    if (!rows.length) return reply.code(400).send({ error: 'That link is no longer valid.' });

    // MUST precede startSession: it reads the epoch through the cache, and the
    // cached value is now one behind. Without this the fresh cookie would carry
    // the old generation and be rejected by its own revocation check. This also
    // disconnects the user's open sockets — the handshake check only stops new
    // connections, and an already-joined socket would keep streaming.
    revokeSessions(uid);
    req.log.info({ uid }, 'password reset completed; prior sessions revoked');
    return startSession(reply, rows[0]);
  });

  // -------------------------------------------------------------------------
  // GET /api/auth/me — current user from the session, or 401.
  // -------------------------------------------------------------------------
  app.get('/api/auth/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const { rows } = await query(
      `SELECT ${PROFILE_COLS} FROM users WHERE id = $1`,
      [req.user.uid]
    );
    if (!rows.length) {
      // Token valid but user deleted — clear the stale cookie.
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return reply.code(401).send({ error: 'user no longer exists' });
    }
    return { user: rows[0] };
  });

  // -------------------------------------------------------------------------
  // POST /api/onboarding/complete — mark the setup wizard done. Idempotent:
  // the timestamp is only stamped the first time, so re-calls are safe.
  // -------------------------------------------------------------------------
  app.post('/api/onboarding/complete', { preHandler: app.requireAuth }, async (req, reply) => {
    const { rows } = await query(
      `SELECT ${PROFILE_COLS} FROM users WHERE id = $1`,
      [req.user.uid]
    );
    if (!rows.length) {
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return reply.code(401).send({ error: 'user no longer exists' });
    }
    let user = rows[0];
    if (needsOnboarding(user)) {
      ({ rows: [user] } = await query(
        `UPDATE users SET onboarded_at = now() WHERE id = $1
         RETURNING ${PROFILE_COLS};`,
        [req.user.uid]
      ));
    }
    return { user };
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/logout — clear the session cookie.
  // -------------------------------------------------------------------------
  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
}
