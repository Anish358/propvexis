import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import { isEmailPermitted } from './access.js';
import { needsOnboarding } from './onboarding.js';
import { pool, query } from './db.js';
import {
  equalizeTiming,
  hashPassword,
  isEmailShaped,
  normalizeEmail,
  passwordProblem,
  verifyPassword,
} from './credentials.js';

const COOKIE_NAME = 'session';
// Columns every auth route returns to the client. Never widen this to `*` —
// password_hash lives on the same row.
const USER_COLS = 'id, email, name, picture, plan, onboarded_at';
const googleClient = new OAuth2Client(config.googleClientId);

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
  try {
    await client.query('BEGIN');

    let { rows } = await client.query(
      'SELECT id FROM users WHERE google_sub = $1 FOR UPDATE',
      [sub]
    );

    if (rows.length) {
      ({ rows } = await client.query(
        `UPDATE users SET email = $2, name = $3, picture = $4, last_login_at = now()
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
        ({ rows } = await client.query(
          `UPDATE users SET google_sub = $2, name = $3, picture = $4,
                            password_hash = NULL, last_login_at = now()
           WHERE id = $1 RETURNING ${USER_COLS};`,
          [rows[0].id, sub, name, picture]
        ));
      } else {
        ({ rows } = await client.query(
          `INSERT INTO users (google_sub, email, name, picture)
           VALUES ($1, $2, $3, $4) RETURNING ${USER_COLS};`,
          [sub, email, name, picture]
        ));
      }
    }

    await client.query('COMMIT');
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
  // `req.user` holds the JWT payload ({ uid, email, name }).
  app.decorate('requireAuth', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'authentication required' });
    }
  });

  // Build the timing-equalizer's decoy hash now: otherwise the FIRST
  // unknown-email login on a cold process pays to create it and lands ~2x
  // slower than the rest, which is exactly the signal equalizeTiming exists to
  // remove. Fire-and-forget — a failure here only affects that one request.
  equalizeTiming().catch(() => {});

  // Issue the session cookie for a user row and return the API shape. Shared by
  // all three ways in (Google, signup, password login).
  const startSession = async (reply, user) => {
    const token = await reply.jwtSign({ uid: Number(user.id), email: user.email, name: user.name });
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
  // GET /api/auth/me — current user from the session, or 401.
  // -------------------------------------------------------------------------
  app.get('/api/auth/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const { rows } = await query(
      'SELECT id, email, name, picture, plan, onboarded_at, created_at, last_login_at FROM users WHERE id = $1',
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
      'SELECT id, email, name, picture, plan, onboarded_at, created_at, last_login_at FROM users WHERE id = $1',
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
         RETURNING id, email, name, picture, plan, onboarded_at, created_at, last_login_at;`,
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
