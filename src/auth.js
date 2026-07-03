import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import { pool, query } from './db.js';

const COOKIE_NAME = 'session';
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
async function findOrCreateUser({ sub, email, name, picture }) {
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
         WHERE id = $1 RETURNING id, email, name, picture;`,
        [rows[0].id, email, name, picture]
      ));
    } else {
      // No row for this sub — maybe a pre-seeded row exists for this email.
      ({ rows } = await client.query('SELECT id FROM users WHERE email = $1 FOR UPDATE', [email]));
      if (rows.length) {
        ({ rows } = await client.query(
          `UPDATE users SET google_sub = $2, name = $3, picture = $4, last_login_at = now()
           WHERE id = $1 RETURNING id, email, name, picture;`,
          [rows[0].id, sub, name, picture]
        ));
      } else {
        ({ rows } = await client.query(
          `INSERT INTO users (google_sub, email, name, picture)
           VALUES ($1, $2, $3, $4) RETURNING id, email, name, picture;`,
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

    // Allowlist: fail closed. An empty allowlist denies everyone.
    if (!config.allowedEmails.includes(email)) {
      req.log.warn({ email }, 'login rejected: email not in allowlist');
      return reply.code(403).send({ error: 'this account is not allowed' });
    }

    const user = await findOrCreateUser({
      sub: payload.sub,
      email,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    });

    const token = await reply.jwtSign({ uid: Number(user.id), email: user.email, name: user.name });
    reply.setCookie(COOKIE_NAME, token, sessionCookieOpts());
    return { user };
  });

  // -------------------------------------------------------------------------
  // GET /api/auth/me — current user from the session, or 401.
  // -------------------------------------------------------------------------
  app.get('/api/auth/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const { rows } = await query(
      'SELECT id, email, name, picture, created_at, last_login_at FROM users WHERE id = $1',
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
  // POST /api/auth/logout — clear the session cookie.
  // -------------------------------------------------------------------------
  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
}
