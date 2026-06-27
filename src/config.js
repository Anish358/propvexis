import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/amey_journal',
  ingestToken: process.env.INGEST_TOKEN ?? 'dev-token-please-change',
  corsOrigin:
    (process.env.CORS_ORIGIN ?? '*') === '*'
      ? '*'
      : (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),

  // ---- Auth (Google login + JWT session cookie) ----
  // OAuth 2.0 Web client ID from Google Cloud Console; the frontend uses it to
  // mint an ID token, the backend verifies the token's `aud` against it.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  // Secret used to sign the session JWT. MUST be set to a long random string in prod.
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-me',
  // Allowlist: only these emails may log in. Empty list = deny everyone (fail closed).
  allowedEmails: (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  // Session cookie: how long the JWT is valid, and whether to require HTTPS.
  sessionMaxDays: Number(process.env.SESSION_MAX_DAYS ?? 30),
  // Secure cookies need HTTPS; default on in prod, off in local http dev.
  cookieSecure:
    process.env.COOKIE_SECURE != null ? process.env.COOKIE_SECURE === 'true' : isProd,
};
