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

  // ---- Observability (Sentry) ----
  // DSN from the Sentry project. Empty = Sentry disabled (a no-op), so local/dev
  // and unconfigured environments run without it. `environment`/`release` tag events.
  sentryDsn: process.env.SENTRY_DSN ?? '',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE ?? '',
};

// Fail closed: refuse to start the server in production with the shipped dev
// defaults still in place (they'd let anyone forge sessions or ingest trades).
// Called from server start() rather than at import time, so scripts that only
// need DATABASE_URL (migrations, imports) aren't blocked. Returns nothing;
// throws on misconfig so the process exits before listening.
export function assertProdSecrets() {
  if (!isProd) return;
  const insecure = [];
  if (config.sessionSecret === 'dev-session-secret-change-me') insecure.push('SESSION_SECRET');
  if (config.ingestToken === 'dev-token-please-change') insecure.push('INGEST_TOKEN');
  if (!config.googleClientId) insecure.push('GOOGLE_CLIENT_ID');
  if (insecure.length) {
    throw new Error(
      `refusing to start in production with missing/insecure config: ${insecure.join(', ')}`
    );
  }
  // A blank allowlist already denies every login (fail closed), but in prod
  // that's almost always a misconfig — warn loudly rather than silently lock out.
  if (config.allowedEmails.length === 0) {
    console.warn('[config] ALLOWED_EMAILS is empty — all logins will be denied');
  }
}
