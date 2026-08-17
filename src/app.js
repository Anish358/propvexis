import './platform/instrument.js'; // Sentry init — must run before other imports load
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server as IOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { config, assertProdSecrets } from './platform/config.js';
import { pool } from './platform/db.js';
import { registerAuth } from './platform/auth/auth.js';
import { ownedLogins } from './domain/accounts/accounts.js';
import { evaluateAccountAlerts } from './domain/alerts/notifications.js';
import { listStrategies } from './domain/trades/strategies.js';
import { clusterSafety, isClustered } from './platform/cluster.js';
import { createRedisPair, redisStatus, redisNamespace } from './platform/redis.js';
import { statsBus, INVALIDATE_CHANNEL } from './platform/statsBus.js';
import { recordHttp } from './platform/metrics.js';
import systemRoutes from './routes/system.js';
import tradeRoutes from './routes/trades.js';
import candleRoutes from './routes/candles.js';
import accountRoutes from './routes/accounts.js';
import strategyRoutes from './routes/strategies.js';
import payoutRoutes from './routes/payouts.js';
import propRoutes from './routes/prop.js';
import notificationRoutes from './routes/notifications.js';
import journalRoutes from './routes/journal.js';
import analyticsRoutes from './routes/analytics.js';
import billingRoutes from './routes/billing.js';

// trustProxy: the app runs behind Caddy (reverse_proxy 127.0.0.1:3000), so
// without this every request's IP is 127.0.0.1 (the proxy) — which would make
// the rate limiter key/allow-list on the proxy, not the real client. Trusting
// X-Forwarded-For gives req.ip the actual client IP. Safe because the backend
// binds loopback only (HOST=127.0.0.1), so Caddy is the sole caller and XFF
// can't be spoofed from outside. Revisit if the backend is ever exposed directly.
const app = Fastify({ logger: true, trustProxy: true });

// Capture the raw request bytes on JSON requests so the Razorpay webhook can
// verify its HMAC signature over EXACTLY what was sent (re-serialized JSON would
// not match). Behavior-identical to the default parser otherwise.
app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  req.rawBody = body;
  if (!body || body.length === 0) return done(null, {});
  try { done(null, JSON.parse(body.toString('utf8'))); }
  catch (err) { err.statusCode = 400; done(err); }
});

// Report unhandled route errors to Sentry (no-op if SENTRY_DSN is unset). Fastify
// still logs + returns its 500 as before; this just also captures the exception.
if (config.sentryDsn) Sentry.setupFastifyErrorHandler(app);

// Credentialed CORS: the session cookie can't be sent with `origin: '*'`, so
// when CORS_ORIGIN is unset/* we reflect the request origin (valid with
// credentials), otherwise we use the configured allowlist.
await app.register(cors, {
  origin: config.corsOrigin === '*' ? true : config.corsOrigin,
  credentials: true,
});

// Blanket abuse guard: cap requests per IP. Generous enough for a browsing user
// (a page load fires several API calls) and the EA's polling, but stops a flood.
// Registered BEFORE the routes so per-route overrides (config.rateLimit) apply —
// the /health check is exempted and the auth login route is throttled harder.
// Loopback is allow-listed so local health checks / same-host tooling aren't hit.
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1', '::1'],
});

// Auth: cookie + JWT plugins, the `requireAuth` guard, and /api/auth/* routes.
await registerAuth(app);

// Socket.IO shares Fastify's underlying HTTP server. Credentials enabled so the
// session cookie rides along (same-origin in prod; Vite proxy in dev).
const io = new IOServer(app.server, {
  cors: { origin: config.corsOrigin === '*' ? true : config.corsOrigin, credentials: true },
});

// ---------------------------------------------------------------------------
// Cross-process state (optional, REDIS_URL-gated). Two things need it before a
// second worker can exist: the Socket.IO adapter (so a broadcast reaches clients
// on every worker) and analytics-cache invalidation. With no Redis this whole
// block is inert and behaviour is identical to before.
// ---------------------------------------------------------------------------
const redis = await createRedisPair(app.log);
// Namespace EVERYTHING by environment: prod/staging/dev share one Redis and its
// pub/sub is global (databases do not isolate it), so un-prefixed channels would
// deliver a prod broadcast to a staging client — same user ids, since those DBs
// are replicas of prod.
const ns = redisNamespace();
if (redis) {
  io.adapter(createAdapter(redis.pub, redis.sub, { key: `${ns}:socket.io` }));
  // pub/sub only; the subscriber connection cannot issue other commands.
  statsBus.setTransport(
    (channel, message) => redis.pub.publish(channel, message),
    `${ns}:${INVALIDATE_CHANNEL}`
  );
  // Local-only handling — onMessage must never re-publish, or workers ping-pong.
  await redis.sub.subscribe(statsBus.channel, (message) => statsBus.onMessage(message));
  app.log.info({ namespace: ns, channel: statsBus.channel }, 'socket.io using the redis adapter');
}
// Every write path goes through this, so the fanout can't be forgotten at a call site.
const invalidateStats = (userId) => statsBus.invalidate(userId);

// Authenticate each socket from the session cookie and join it to a room per
// account the user owns, so trade events are delivered only to their owner —
// never broadcast to every connected client.
io.on('connection', async (socket) => {
  try {
    const raw = socket.handshake.headers.cookie;
    const token = raw ? app.parseCookie(raw).session : null;
    if (!token) throw new Error('no session cookie');
    const payload = app.jwt.verify(token);
    socket.data.uid = payload.uid;
    socket.join(`user:${payload.uid}`); // for account-less (strategy/manual) trade events
    const logins = await ownedLogins(payload.uid);
    for (const l of logins) socket.join(`acct:${l}`);
    app.log.info({ id: socket.id, uid: payload.uid, rooms: logins.length }, 'socket authenticated');
  } catch (err) {
    // Unauthenticated socket: connected but in no rooms, so it receives nothing.
    app.log.info({ id: socket.id, reason: err.message }, 'socket unauthenticated');
  }
});

// Emit a trade event to its owner. Prefer the per-user room (covers account-less
// strategy/manual trades and reaches every view); fall back to the account room
// for legacy grace-period ingests that have no owner yet.
const emitTrade = (event, trade) => {
  const room = trade.user_id != null ? `user:${trade.user_id}` : `acct:${trade.account_id}`;
  io.to(room).emit(event, trade);
  // Any trade write invalidates that user's cached aggregates. Doing it here
  // covers ingest + manual add + edit, which all funnel through emitTrade;
  // delete, CSV import and strategy rename invalidate at their own call sites.
  invalidateStats(trade.user_id);
};

// Recompute one account's prop state and push any newly-crossed alerts to the
// owner in real time. Best-effort: never let alert evaluation break an ingest.
async function runAlerts(userId, login) {
  if (userId == null || login == null) return;
  try {
    const created = await evaluateAccountAlerts(Number(userId), Number(login));
    for (const n of created) io.to(`user:${userId}`).emit('notification:new', n);
  } catch (err) {
    app.log.warn({ err: err.message, login }, 'alert evaluation failed');
  }
}

// Map of strategy name -> rules for a user, to annotate trades with objective
// rule adherence (see adherence.js). One small query; cached per request path.
const rulesMapFor = async (userId) =>
  new Map((await listStrategies(userId)).map((s) => [s.name, s.rules]));

// ---------------------------------------------------------------------------
// Prometheus metrics. The onResponse hook feeds the RED metrics (request rate,
// errors, latency) for every route; /metrics exposes the registry for scraping.
// The route TEMPLATE (req.routeOptions.url) is used as the label — never the raw
// URL — so path params don't explode label cardinality. /metrics scrapes itself
// out to avoid self-referential noise.
// ---------------------------------------------------------------------------
app.addHook('onResponse', (req, reply, done) => {
  const route = req.routeOptions?.url;
  if (route && route !== '/metrics') {
    recordHttp({
      method: req.method,
      route,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    });
  }
  done();
});

// ---------------------------------------------------------------------------
// Routes. Every group lives in src/routes/, and each is a plain function called
// on THIS instance — not app.register(). See any route module's header for why:
// a registered plugin is encapsulated, and routes inside it would not see
// app.requireAuth or the global rate-limit hook, both of which are wired above.
//
// Grouping by domain reorders some registrations relative to the single file this
// came from (/api/account now precedes /api/strategies). That is safe, and it is
// worth knowing WHY rather than assuming: Fastify routes through find-my-way, a
// radix tree that prefers a static segment over a parametric one regardless of
// declaration order — so /api/trades/import still wins over /api/trades/:id — and
// it throws on a duplicate path instead of letting the first or last silently win.
// Verified empirically, not just from the docs: every route below answers with the
// same status it did before the split (see test/routes-split.test.js).
// ---------------------------------------------------------------------------
const ctx = { io, emitTrade, runAlerts, invalidateStats, rulesMapFor };

systemRoutes(app);
tradeRoutes(app, ctx);
candleRoutes(app, ctx);
accountRoutes(app, ctx);
strategyRoutes(app, ctx);
payoutRoutes(app, ctx);
propRoutes(app, ctx);
notificationRoutes(app);
journalRoutes(app);
analyticsRoutes(app);
billingRoutes(app, ctx);

// ---------------------------------------------------------------------------
const start = async () => {
  try {
    assertProdSecrets();
    // If someone raises `instances` in ecosystem.config.cjs while Redis is
    // absent or down, realtime delivery and cached analytics both go subtly
    // wrong rather than failing outright — so say so loudly at boot. Both flags
    // are live, not compile-time: Redis can drop long after a good boot, and the
    // socket adapter then goes quietly one-way. See src/platform/cluster.js.
    const safety = clusterSafety({
      clustered: isClustered(),
      hasSharedSocketAdapter: !!redis && redisStatus.connected,
      hasSharedStatsCache: statsBus.shared && redisStatus.connected,
    });
    if (!safety.safe) {
      for (const reason of safety.reasons) {
        app.log.error({ workerIndex: process.env.NODE_APP_INSTANCE }, `UNSAFE CLUSTER MODE: ${reason}`);
      }
    }
    // Partial Razorpay config fails SAFE (billing 503s) but silently — the
    // dashboard shows keys set while checkout is dead. Name the missing var.
    const rzpMissing = ['razorpayKeyId', 'razorpayKeySecret', 'razorpayWebhookSecret']
      .filter((k) => !config[k]);
    if (rzpMissing.length && rzpMissing.length < 3) {
      app.log.error(
        { missing: rzpMissing.map((k) => k.replace(/^razorpay/, 'RAZORPAY_').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()) },
        'PAYMENTS DISABLED: Razorpay is partially configured — billing routes will 503'
      );
    } else if (!rzpMissing.length && !config.razorpayPlanPro) {
      app.log.error('PAYMENTS: keys are set but RAZORPAY_PLAN_PRO is missing — /subscribe will 503');
    }
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async () => {
  app.log.info('shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
