import 'dotenv/config';

// In production, process.env has already been hydrated from AWS SSM Parameter
// Store by src/secrets.js (run from the entry point before this module loads),
// so the reads below transparently pick up SSM-sourced secrets. Locally / when
// SSM_PREFIX is unset, that step is a no-op and dotenv/.env supplies the values.
const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/amey_journal',

  // ---- Postgres connection pool (see src/db.js poolOptions) ----
  // node-pg defaults to max:10 with NO connectionTimeoutMillis, so a traffic
  // burst silently queues forever on an exhausted pool instead of failing fast.
  // That pairing was the top bottleneck for the >=1000-concurrent-user bar.
  //
  // SIZING IS PER PROCESS. Under pm2 cluster mode the box holds
  // (workers x pgPoolMax) server connections, and prod/staging/dev share ONE
  // native PG16 instance (max_connections=100, 3 superuser-reserved). Budget:
  // prod 2 workers x 20 = 40, leaving room for the two small side envs.
  // Raise PG_POOL_MAX only together with Postgres `max_connections`.
  pgPoolMax: Number(process.env.PG_POOL_MAX ?? 20),
  // Evict idle clients fairly quickly — each one is a real PG backend process
  // (~5-10MB) and the box is a 1GB t3.micro.
  pgPoolIdleTimeoutMs: Number(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? 30_000),
  // Fail fast when the pool is saturated: a queued request errors after this
  // instead of hanging the HTTP handler indefinitely.
  pgPoolConnectionTimeoutMs: Number(process.env.PG_POOL_CONNECTION_TIMEOUT_MS ?? 5_000),
  // Recycle a client after this many checkouts, so a slow server-side leak
  // (temp tables, prepared statements, session GUCs) can't accumulate forever.
  pgPoolMaxUses: Number(process.env.PG_POOL_MAX_USES ?? 7_500),
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
  // Open signup: when true, ANY verified Google account may sign in/up. When
  // false (default), only ALLOWED_EMAILS may log in (fail closed on empty). An
  // explicit flag, so a fresh deploy with no config is never accidentally open.
  openSignup: process.env.OPEN_SIGNUP === 'true',
  // Session cookie: how long the JWT is valid, and whether to require HTTPS.
  sessionMaxDays: Number(process.env.SESSION_MAX_DAYS ?? 30),
  // Secure cookies need HTTPS; default on in prod, off in local http dev.
  cookieSecure:
    process.env.COOKIE_SECURE != null ? process.env.COOKIE_SECURE === 'true' : isProd,

  // ---- Payments (Razorpay recurring subscriptions) ----
  // All optional: when unset, paymentsEnabled() is false, billing routes 503,
  // and the app runs exactly as before. Deliberately NOT in assertProdSecrets —
  // prod must keep booting until real keys are added. Set the TEST keys locally
  // to exercise the flow; create the ₹399 Plan in the Razorpay dashboard and put
  // its id in RAZORPAY_PLAN_PRO.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  razorpayPlanPro: process.env.RAZORPAY_PLAN_PRO ?? '',

  // ---- Economic calendar (dashboard high-impact events) ----
  // Free public ForexFactory weekly JSON feed (no API key) — same $0-cost ethos
  // as the EA-sourced candles. Override to point at a mirror; set to an empty
  // string to disable (then /api/calendar returns no events and the banner shows
  // its graceful fallback).
  // Comma-separated feed URLs, merged before filtering. The free faireconomy
  // (ForexFactory) feed only publishes the current week — so once this week's
  // events are past (they cluster mid-week), the banner correctly shows its
  // empty state until the next week's feed rolls over. Add mirror/next-week URLs
  // here if a source becomes available.
  econCalendarUrls: (
    process.env.ECON_CALENDAR_URL ?? 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
  ).split(',').map((s) => s.trim()).filter(Boolean),

  // Which deployment this process is: 'prod' | 'staging' | 'dev' | 'local'.
  // NOT the same as NODE_ENV — all three box envs run NODE_ENV=production, so
  // NODE_ENV cannot tell them apart. Set per app in ecosystem.config.cjs.
  // Used to namespace shared Redis channels: the three envs share ONE Redis, and
  // Redis pub/sub is global (NOT per-database), so without this prefix a prod
  // socket broadcast would be delivered to staging/dev clients — which hold the
  // same user ids, because those DBs are replicas of prod.
  appEnv: process.env.APP_ENV ?? 'local',

  // ---- Redis (optional: shared socket adapter + cache invalidation) ----
  // Empty = disabled, and the app runs exactly as it did single-process (see
  // src/redis.js). Accepts redis:// and rediss:// (TLS), so the same value works
  // for a native redis-server on the box, Upstash, or ElastiCache. REQUIRED
  // before running more than one pm2 worker — see src/cluster.js.
  redisUrl: process.env.REDIS_URL ?? '',

  // ---- Observability (Sentry) ----
  // DSN from the Sentry project. Empty = Sentry disabled (a no-op), so local/dev
  // and unconfigured environments run without it. `environment`/`release` tag events.
  sentryDsn: process.env.SENTRY_DSN ?? '',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE ?? '',

  // ---- Observability (Prometheus metrics) ----
  // Optional bearer token guarding GET /metrics. Empty = unguarded, which is
  // safe in prod because the backend binds loopback and Caddy does not proxy
  // /metrics, so it's reachable only on the box (by a co-located Prometheus).
  // Set it for defense-in-depth; Prometheus then scrapes with a bearer_token.
  metricsToken: process.env.METRICS_TOKEN ?? '',
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
  // With open signup off, a blank allowlist denies every login (fail closed);
  // in prod that's almost always a misconfig — warn rather than silently lock out.
  if (!config.openSignup && config.allowedEmails.length === 0) {
    console.warn('[config] ALLOWED_EMAILS is empty and OPEN_SIGNUP is not set — all logins will be denied');
  }
}
