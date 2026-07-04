import './instrument.js'; // Sentry init — must run before other imports load
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server as IOServer } from 'socket.io';
import { config, assertProdSecrets } from './config.js';
import { pool, query } from './db.js';
import { registerAuth } from './auth.js';
import {
  resolveScope,
  listAccounts,
  tradeOwnerUserId,
  ownedLogins,
  accountByToken,
  bindOrCheckLogin,
  createAccount,
  updateAccount,
  deleteAccount,
  ownedAccountByLogin,
} from './accounts.js';
import { listPayouts, createPayout, deletePayout, recordEaPayout } from './payouts.js';
import { challengeState } from './prop.js';
import { phasePassedAlert } from './alerts.js';
import { evaluateAccountAlerts, insertNotifications, listNotifications, markRead } from './notifications.js';
import {
  activeChallengesByLogin,
  challengeHistory,
  advanceChallenge,
  createChallengeForAccount,
  syncActiveChallengeRules,
  insertEquitySnapshots,
  tradesForEngine,
  equitySnapshotsForEngine,
} from './challenges.js';
import { planForUser, syncedAccountCount, manualAccountCount } from './entitlements.js';
import { canUseEA, accountLimit, manualAccountLimit } from './plans.js';
import { parseCsv, buildImportTrades } from './csv.js';
import { paymentsEnabled, createSubscription, cancelSubscription, verifyWebhookSignature, planStateFromEvent } from './payments.js';
import {
  listStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
} from './strategies.js';
import { adherenceOf } from './adherence.js';
import {
  replayWindow,
  enqueueCandleRequest,
  pendingRequestsForLogin,
  markRequestDone,
  upsertCandles,
  listCandles,
  windowRequestStatus,
} from './candles.js';
import { computeStats, computeYearly } from './aggregations.js';
import {
  priceToPips,
  pipSize,
  deriveSession,
  deriveFixedR,
  deriveMaxR,
  normalizeSymbol,
  round2,
} from './derive.js';

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

// ---- columns the user may set when tagging a trade ----
const TAG_FIELDS = [
  'setup',
  'probability',
  'mtf_phase',
  'm15_url',
  'h1_url',
  'h4_url',
  'comments',
];

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', { config: { rateLimit: false } }, async () => {
  await query('SELECT 1');
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Ingest — called by the MT5 EA on trade close. Idempotent upsert by ticket.
// ---------------------------------------------------------------------------
const ingestSchema = {
  body: {
    type: 'object',
    required: [
      'mt5_ticket',
      'account_id',
      'symbol',
      'direction',
      'open_time',
      'close_time',
      'entry_price',
      'exit_price',
    ],
    properties: {
      mt5_ticket: { type: 'integer' },
      account_id: { type: 'integer' },
      symbol: { type: 'string' },
      direction: { type: 'string', enum: ['buy', 'sell'] },
      open_time: { type: 'string' },
      close_time: { type: 'string' },
      entry_price: { type: 'number' },
      sl_price: { type: ['number', 'null'] },
      tp_price: { type: ['number', 'null'] },
      exit_price: { type: 'number' },
      volume: { type: ['number', 'null'] },
      commission: { type: ['number', 'null'] },
      pnl_money: { type: ['number', 'null'] },
      sl_size_pips: { type: ['number', 'null'] },
      mfe_pips: { type: ['number', 'null'] },
      mfe_price: { type: ['number', 'null'] }, // raw favorable price excursion; converted to pips here
      session: { type: ['string', 'null'], enum: ['ASIA', 'LDN', 'NY', null] },
      account_balance: { type: ['number', 'null'] },  // live MT5 balance at close
      account_equity: { type: ['number', 'null'] },    // live MT5 equity at close
      account_currency: { type: ['string', 'null'] },
    },
  },
};

app.post('/api/trades/ingest', { schema: ingestSchema }, async (req, reply) => {
  const b = req.body;

  // Auth: prefer a per-account token (auto-binds the MT5 login on first trade);
  // fall back to the legacy global token during the cutover (grace period).
  const token = req.headers['x-ingest-token'];
  if (!token) return reply.code(401).send({ error: 'missing ingest token' });

  const acct = await accountByToken(token);
  if (acct) {
    // Plan gate: EA sync is a Pro+ feature. Free users can't reach here anyway
    // (account creation is plan-capped, so they hold no per-account token), but
    // enforce server-side too — covers a Pro→Free downgrade whose token lingers.
    if (!canUseEA(await planForUser(acct.user_id))) {
      return reply.code(402).send({ error: 'EA sync requires the Pro plan' });
    }
    const result = await bindOrCheckLogin(acct, b.account_id);
    if (result === 'mismatch') {
      return reply.code(403).send({ error: 'token does not match this MT5 account' });
    }
    if (result === 'conflict') {
      return reply.code(409).send({ error: 'this MT5 login is already registered to another account' });
    }
    if (result === 'bound') {
      req.log.info({ account: acct.id, login: b.account_id }, 'auto-bound MT5 login to account');
    }
  } else if (token !== config.ingestToken) {
    return reply.code(401).send({ error: 'invalid ingest token' });
  }
  // (legacy global token: accepted, no ownership binding — grace period only)


  // Normalize broker suffixes (EURUSD.r -> EURUSD) so pip math + grouping are correct.
  const symbol_base = normalizeSymbol(b.symbol);

  // Fill any gaps the EA didn't provide.
  const sl_size_pips =
    b.sl_size_pips ??
    (b.sl_price != null ? priceToPips(symbol_base, b.entry_price - b.sl_price) : null);
  // The EA tracks MFE as a raw price distance; convert to pips with the same
  // symbol-aware logic used for SL so the convention matches the sheet.
  const mfe_pips =
    b.mfe_pips ?? (b.mfe_price != null ? priceToPips(symbol_base, b.mfe_price) : null);
  const session = b.session ?? deriveSession(b.open_time);
  const max_r = deriveMaxR({ mfe_pips, sl_size_pips });
  const fixed_r = deriveFixedR(b);

  const row = {
    mt5_ticket: b.mt5_ticket,
    account_id: b.account_id,
    user_id: acct ? Number(acct.user_id) : null, // owner (from the account's token)
    symbol: b.symbol,
    symbol_base,
    direction: b.direction,
    open_time: b.open_time,
    close_time: b.close_time,
    session,
    entry_price: b.entry_price,
    sl_price: b.sl_price ?? null,
    tp_price: b.tp_price ?? null,
    exit_price: b.exit_price,
    volume: b.volume ?? null,
    commission: b.commission ?? 0,
    pnl_money: b.pnl_money ?? null,
    sl_size_pips: round2(sl_size_pips),
    mfe_pips: round2(mfe_pips),
    max_r,
    fixed_r,
  };

  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const values = cols.map((c) => row[c]);

  // On conflict, update only the mechanical fields — never clobber the
  // discretionary tags the user already added. MFE is finalized later (from
  // price history), so once known it must NOT be wiped by a later metric-less
  // send (the immediate close payload or a backfill) — preserve it via COALESCE.
  const PRESERVE_IF_NULL = new Set(['mfe_pips', 'max_r', 'user_id']);
  const updates = cols
    .filter((c) => !['mt5_ticket', 'account_id'].includes(c))
    .map((c) =>
      PRESERVE_IF_NULL.has(c)
        ? `${c} = COALESCE(EXCLUDED.${c}, trades.${c})`
        : `${c} = EXCLUDED.${c}`
    )
    .join(', ');

  const sql = `
    INSERT INTO trades (${cols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (account_id, mt5_ticket)
    DO UPDATE SET ${updates}
    RETURNING *;
  `;

  const { rows } = await query(sql, values);
  const trade = rows[0];

  emitTrade('trade:upserted', trade);

  // Queue the trade's replay window for this account's EA (idempotent — the
  // MFE-finalize resend collapses into the same request). Skip degenerate
  // backfills where open == close (no window to chart).
  if (
    trade.entry_price != null &&
    trade.exit_price != null &&
    new Date(trade.close_time) > new Date(trade.open_time)
  ) {
    try {
      await enqueueCandleRequest(trade);
    } catch (err) {
      req.log.warn({ err: err.message }, 'candle request enqueue failed');
    }
  }

  // Snapshot live account balance/equity if the EA sent it (latest wins).
  if (b.account_balance != null || b.account_equity != null) {
    const { rows: accRows } = await query(
      `INSERT INTO accounts (account_id, balance, equity, currency, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (account_id) DO UPDATE SET
         balance = COALESCE(EXCLUDED.balance, accounts.balance),
         equity = COALESCE(EXCLUDED.equity, accounts.equity),
         currency = COALESCE(EXCLUDED.currency, accounts.currency),
         updated_at = now()
       RETURNING *;`,
      [b.account_id, b.account_balance ?? null, b.account_equity ?? null, b.account_currency ?? null]
    );
    io.to(`acct:${b.account_id}`).emit('account:updated', accRows[0]);
  }

  // Fire prop alerts on LIVE closes only — a recent close is the trader trading
  // now; old closes (backfill) would recompute state needlessly (dedup would drop
  // the alerts anyway, but skip the work). Owner known = a per-account token.
  if (acct && new Date(trade.close_time) > new Date(Date.now() - 3600_000)) {
    await runAlerts(acct.user_id, b.account_id);
  }

  return reply.code(201).send(trade);
});

// ---------------------------------------------------------------------------
// List trades (newest first). Optional filters: ?tagged=false&limit=100
// ---------------------------------------------------------------------------
app.get('/api/trades', { preHandler: app.requireAuth }, async (req, reply) => {
  const scope = await resolveScope(req.user.uid, req.query.account_id);
  if (!scope) return reply.code(403).send({ error: 'account not found' });

  const { tagged, limit = 200 } = req.query;
  const params = [scope.filterVal];
  const where = [`${scope.filterCol} = $1`];
  if (tagged === 'true' || tagged === 'false') {
    params.push(tagged === 'true');
    where.push(`tagged = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 200, 1000));
  const sql = `
    SELECT * FROM trades
    WHERE ${where.join(' AND ')}
    ORDER BY close_time DESC
    LIMIT $${params.length};
  `;
  const { rows } = await query(sql, params);
  // Annotate each trade with objective rule adherence (followed/broke its
  // strategy's rules), derived from mechanical fields — see adherence.js.
  const rulesByName = await rulesMapFor(req.user.uid);
  return rows.map((t) => ({ ...t, adherence: adherenceOf(t, rulesByName) }));
});

// ---------------------------------------------------------------------------
// Manual trade entry — result is entered directly in R (fixed_r); price-derived
// fields are skipped. Owned by the user. Optionally scoped to one of the user's
// own accounts via `account_id` (so it shows in that per-account view); omit it
// (account_id NULL) for an account-less strategy trade that lives in god view.
// ---------------------------------------------------------------------------
app.post('/api/trades', { preHandler: app.requireAuth }, async (req, reply) => {
  const b = req.body ?? {};
  if (!b.close_time) return reply.code(400).send({ error: 'close_time is required' });
  const fixed_r = b.fixed_r == null || b.fixed_r === '' ? null : Number(b.fixed_r);
  if (fixed_r == null || Number.isNaN(fixed_r)) {
    return reply.code(400).send({ error: 'fixed_r (R result) is required' });
  }
  if (b.direction != null && !['buy', 'sell'].includes(b.direction)) {
    return reply.code(400).send({ error: 'direction must be buy, sell, or omitted' });
  }

  // Optional account scope: must be one of the requester's own accounts.
  let account_id = null;
  if (b.account_id != null && b.account_id !== '') {
    const login = Number(b.account_id);
    if (Number.isNaN(login) || !(await ownedAccountByLogin(req.user.uid, login))) {
      return reply.code(400).send({ error: 'account not found' });
    }
    account_id = login;
  }

  const symbol = b.symbol || 'MANUAL';
  const symbol_base = normalizeSymbol(symbol);
  const open_time = b.open_time || b.close_time;
  const num = (v) => (v == null || v === '' ? null : round2(Number(v)));
  const sl_size_pips = num(b.sl_size_pips);
  const mfe_pips = num(b.mfe_pips);

  const row = {
    mt5_ticket: null,
    account_id,
    user_id: Number(req.user.uid),
    source: 'manual',
    symbol,
    symbol_base,
    direction: b.direction ?? null,
    open_time,
    close_time: b.close_time,
    session: b.session ?? deriveSession(open_time),
    pnl_money: b.pnl_money == null || b.pnl_money === '' ? null : Number(b.pnl_money),
    sl_size_pips,
    mfe_pips,
    max_r: deriveMaxR({ mfe_pips, sl_size_pips }),
    fixed_r: round2(fixed_r),
    setup: b.setup ?? null,
    probability: b.probability ?? null,
    mtf_phase: b.mtf_phase ?? null,
    comments: b.comments ?? null,
    tagged: true,
  };
  const cols = Object.keys(row);
  const sql = `INSERT INTO trades (${cols.join(', ')})
               VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;
  const { rows } = await query(sql, cols.map((c) => row[c]));
  const trade = { ...rows[0], adherence: adherenceOf(rows[0], await rulesMapFor(req.user.uid)) };

  emitTrade('trade:upserted', trade);
  return reply.code(201).send(trade);
});

// ---------------------------------------------------------------------------
// CSV / statement import (Free-tier feature). Body: { csv, dryRun }.
//  - dryRun=true  -> parse + validate only; returns what WOULD import, which
//    columns were detected, per-analytic warnings, dupes, and skipped rows.
//  - dryRun=false -> also inserts (source='import', account_id NULL, owned by
//    the user; shows in god/strategy view like manual trades).
// Dedupe is best-effort on (close_time, symbol_base, fixed_r) among the user's
// existing imports so re-uploading the same file doesn't double rows.
// bodyLimit is raised since the CSV text rides in the JSON body.
// ---------------------------------------------------------------------------
app.post('/api/trades/import', { preHandler: app.requireAuth, bodyLimit: 12 * 1024 * 1024 }, async (req, reply) => {
  const { csv, dryRun } = req.body ?? {};
  if (typeof csv !== 'string' || !csv.trim()) {
    return reply.code(400).send({ error: 'csv text is required' });
  }

  // Optional account scope: import into one of the requester's own accounts
  // (so the rows show in that per-account view); omit for account-less imports.
  let acctLogin = null;
  if (req.body?.account_id != null && req.body.account_id !== '') {
    const login = Number(req.body.account_id);
    if (Number.isNaN(login) || !(await ownedAccountByLogin(req.user.uid, login))) {
      return reply.code(400).send({ error: 'account not found' });
    }
    acctLogin = login;
  }

  const { trades, columns, warnings, skipped, fatal } = buildImportTrades(parseCsv(csv));
  if (fatal) return reply.code(400).send({ error: fatal, columns });

  // Dedupe vs the user's existing imports IN THE SAME account scope (and within
  // this file), so importing the same file into two accounts stays allowed.
  const dupKey = (t) => `${t.close_time}|${t.symbol_base}|${t.fixed_r}`;
  const { rows: existing } = await query(
    "SELECT close_time, symbol_base, fixed_r FROM trades WHERE user_id = $1 AND source = 'import' AND account_id IS NOT DISTINCT FROM $2",
    [req.user.uid, acctLogin]
  );
  const seen = new Set(existing.map((r) => `${new Date(r.close_time).toISOString()}|${r.symbol_base}|${r.fixed_r}`));
  const fresh = [];
  let duplicates = 0;
  for (const t of trades) {
    const k = dupKey(t);
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k);
    fresh.push(t);
  }

  const summary = {
    detectedColumns: Object.keys(columns),
    warnings,
    willImport: fresh.length,
    duplicates,
    skipped: skipped.length,
    skippedRows: skipped.slice(0, 20),
  };

  if (dryRun) return { dryRun: true, ...summary };

  if (fresh.length) {
    // buildImportTrades already emits account_id (null) per row — override its
    // value with the chosen scope rather than adding the column twice.
    const cols = [...Object.keys(fresh[0]), 'user_id'];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const t of fresh) {
        const vals = cols.map((c) =>
          c === 'user_id' ? Number(req.user.uid) : c === 'account_id' ? acctLogin : t[c]);
        const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO trades (${cols.join(', ')}) VALUES (${ph})`, vals);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      req.log.error({ err: e.message }, 'csv import failed');
      return reply.code(500).send({ error: 'import failed while saving trades' });
    } finally {
      client.release();
    }
  }
  return { dryRun: false, imported: fresh.length, ...summary };
});

// ---------------------------------------------------------------------------
// Tag a trade (user fills discretionary fields). Marks tagged = true.
// ---------------------------------------------------------------------------
// Editable numeric metrics. Editing either recomputes max_r = mfe / sl; editing
// the SL size also rescales fixed_r (see below).
const METRIC_FIELDS = ['sl_size_pips', 'mfe_pips'];

app.patch('/api/trades/:id', { preHandler: app.requireAuth }, async (req, reply) => {
  const id = Number(req.params.id);

  // Ownership: the trade's account must belong to the requesting user.
  const ownerId = await tradeOwnerUserId(id);
  if (ownerId == null) return reply.code(404).send({ error: 'trade not found' });
  if (ownerId !== Number(req.user.uid)) return reply.code(403).send({ error: 'forbidden' });

  const updates = [];
  const params = [];

  for (const f of TAG_FIELDS) {
    if (f in req.body) {
      params.push(req.body[f]);
      updates.push(`${f} = $${params.length}`);
    }
  }

  // fixed_r is editable ONLY for manual trades (EA/import trades derive it from
  // prices). Lets a strategy trade's R result be corrected after entry.
  if ('fixed_r' in req.body) {
    const { rows: src } = await query('SELECT source FROM trades WHERE id = $1', [id]);
    if (src.length && src[0].source === 'manual') {
      const v = req.body.fixed_r === '' || req.body.fixed_r === null ? null : Number(req.body.fixed_r);
      if (v == null || Number.isNaN(v)) return reply.code(400).send({ error: 'fixed_r must be a number' });
      params.push(round2(v));
      updates.push(`fixed_r = $${params.length}`);
    }
  }

  // SL size / MFE edits: validate, then recompute Max R from the merged values.
  if (METRIC_FIELDS.some((f) => f in req.body)) {
    const { rows: cur } = await query(
      `SELECT sl_size_pips, mfe_pips, fixed_r, source, direction,
              entry_price, exit_price, symbol, symbol_base
         FROM trades WHERE id = $1`,
      [id]
    );
    if (!cur.length) return reply.code(404).send({ error: 'trade not found' });
    const merged = { sl_size_pips: cur[0].sl_size_pips, mfe_pips: cur[0].mfe_pips };
    for (const f of METRIC_FIELDS) {
      if (!(f in req.body)) continue;
      const raw = req.body[f];
      const v = raw === '' || raw === null ? null : Number(raw);
      if (v != null && (Number.isNaN(v) || v < 0)) {
        return reply.code(400).send({ error: `${f} must be a non-negative number` });
      }
      merged[f] = v == null ? null : round2(v);
      params.push(merged[f]);
      updates.push(`${f} = $${params.length}`);
    }
    params.push(deriveMaxR(merged));
    updates.push(`max_r = $${params.length}`);

    // Changing the SL size recomputes Fixed R. Prefer ACTUAL PRICES — realized
    // reward in pips ÷ new SL — which is robust even if a prior edit left
    // fixed_r and SL out of sync. Fall back to scaling only when prices are
    // absent (e.g. sheet imports). Manual trades keep their entered R.
    if ('sl_size_pips' in req.body && cur[0].source !== 'manual') {
      const c = cur[0];
      const newSl = Number(merged.sl_size_pips);
      const pip = pipSize(c.symbol_base || c.symbol);
      let fr;
      if (newSl > 0 && c.entry_price != null && c.exit_price != null && c.direction && pip) {
        const reward = c.direction === 'buy' ? c.exit_price - c.entry_price : c.entry_price - c.exit_price;
        fr = round2((reward / pip) / newSl);
      } else if (c.fixed_r != null && Number(c.sl_size_pips) > 0 && newSl > 0) {
        fr = round2(Number(c.fixed_r) * Number(c.sl_size_pips) / newSl);
      }
      if (fr !== undefined) {
        params.push(fr);
        updates.push(`fixed_r = $${params.length}`);
      }
    }
  }

  if (!updates.length) {
    return reply.code(400).send({ error: 'no editable fields provided' });
  }
  updates.push('tagged = TRUE');
  params.push(id);

  const sql = `UPDATE trades SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *;`;
  const { rows } = await query(sql, params);
  if (!rows.length) return reply.code(404).send({ error: 'trade not found' });

  // Re-annotate adherence: tagging is where a trade's strategy (setup) is set.
  const trade = { ...rows[0], adherence: adherenceOf(rows[0], await rulesMapFor(req.user.uid)) };
  emitTrade('trade:updated', trade);
  return trade;
});

// ---------------------------------------------------------------------------
// Delete a trade.
// ---------------------------------------------------------------------------
app.delete('/api/trades/:id', { preHandler: app.requireAuth }, async (req, reply) => {
  const id = Number(req.params.id);

  const ownerId = await tradeOwnerUserId(id);
  if (ownerId == null) return reply.code(404).send({ error: 'trade not found' });
  if (ownerId !== Number(req.user.uid)) return reply.code(403).send({ error: 'forbidden' });

  const { rows } = await query('DELETE FROM trades WHERE id = $1 RETURNING id, user_id, account_id', [id]);
  if (!rows.length) return reply.code(404).send({ error: 'trade not found' });

  const t = rows[0];
  const room = t.user_id != null ? `user:${t.user_id}` : `acct:${t.account_id}`;
  io.to(room).emit('trade:deleted', { id });
  return { id, deleted: true };
});

// ---------------------------------------------------------------------------
// Trade replay candles — M1 bars around each trade, supplied by the EA from
// the broker's own history (no third-party data API). The EA polls /requests
// for windows to fill and POSTs the bars to /ingest; /replay serves the chart.
// ---------------------------------------------------------------------------
const candleIngestSchema = {
  body: {
    type: 'object',
    required: ['account_id', 'symbol', 'candles'],
    properties: {
      account_id: { type: 'integer' },
      symbol: { type: 'string' },
      request_id: { type: ['integer', 'null'] }, // candle_requests.id being served
      final: { type: ['boolean', 'null'] },      // last chunk → mark request done
      candles: {
        // compact bars: [epoch_sec_utc, open, high, low, close]
        type: 'array',
        maxItems: 1000,
        items: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'number' } },
      },
    },
  },
};

// Equity snapshots — periodic floating balance/equity from the EA, which upgrades
// the prop engine from realized (closed-trade) drawdown to true floating drawdown.
// A single current sample per POST, or a batch of buffered ones (offline queue).
const equityIngestSchema = {
  body: {
    type: 'object',
    required: ['account_id'],
    properties: {
      account_id: { type: 'integer' },
      ts: { type: ['number', 'null'] },      // epoch seconds (UTC); omit = now
      balance: { type: ['number', 'null'] },
      equity: { type: ['number', 'null'] },
      currency: { type: ['string', 'null'] },
      samples: {
        type: 'array',
        maxItems: 1000,
        items: {
          type: 'object',
          properties: {
            ts: { type: ['number', 'null'] },
            balance: { type: ['number', 'null'] },
            equity: { type: ['number', 'null'] },
          },
        },
      },
    },
  },
};

// epoch seconds (EA convention, matching candles) -> ms; passthrough ms; now if null.
const tsToDate = (ts) => new Date(ts == null ? Date.now() : ts < 1e12 ? ts * 1000 : ts);

app.post('/api/equity/ingest', { schema: equityIngestSchema }, async (req, reply) => {
  const b = req.body;
  const token = req.headers['x-ingest-token'];
  if (!token) return reply.code(401).send({ error: 'missing ingest token' });
  const acct = await accountByToken(token);
  if (!acct) return reply.code(401).send({ error: 'invalid ingest token' });
  // Same Pro+ gate as trade ingest (live equity is an EA-sync feature).
  if (!canUseEA(await planForUser(acct.user_id))) {
    return reply.code(402).send({ error: 'EA sync requires the Pro plan' });
  }
  const bind = await bindOrCheckLogin(acct, b.account_id);
  if (bind === 'mismatch') return reply.code(403).send({ error: 'token does not match this MT5 account' });
  if (bind === 'conflict') return reply.code(409).send({ error: 'MT5 login already registered to another account' });

  const raw = Array.isArray(b.samples) && b.samples.length
    ? b.samples
    : [{ ts: b.ts, balance: b.balance, equity: b.equity }];
  const samples = raw
    .map((s) => ({ ts: tsToDate(s.ts), balance: s.balance ?? null, equity: s.equity ?? null }))
    .filter((s) => s.balance != null || s.equity != null);
  if (!samples.length) return reply.code(400).send({ error: 'balance or equity required' });

  const inserted = await insertEquitySnapshots(b.account_id, samples);

  // Keep the live accounts row fresh from the newest sample, so the balance box
  // stays current between trades (latest wins, same shape as trade ingest).
  const latest = samples.reduce((a, s) => (s.ts > a.ts ? s : a));
  const { rows: accRows } = await query(
    `INSERT INTO accounts (account_id, balance, equity, currency, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (account_id) DO UPDATE SET
       balance = COALESCE(EXCLUDED.balance, accounts.balance),
       equity = COALESCE(EXCLUDED.equity, accounts.equity),
       currency = COALESCE(EXCLUDED.currency, accounts.currency),
       updated_at = now()
     RETURNING *;`,
    [b.account_id, latest.balance, latest.equity, b.currency ?? null]
  );
  io.to(`acct:${b.account_id}`).emit('account:updated', accRows[0]);
  io.to(`acct:${b.account_id}`).emit('prop:updated', { account_id: b.account_id });
  // Floating equity is always current — the primary real-time alert trigger.
  await runAlerts(acct.user_id, b.account_id);
  return reply.code(201).send({ inserted });
});

app.post('/api/candles/ingest', { schema: candleIngestSchema }, async (req, reply) => {
  const b = req.body;
  const token = req.headers['x-ingest-token'];
  if (!token) return reply.code(401).send({ error: 'missing ingest token' });
  const acct = await accountByToken(token);
  if (!acct) return reply.code(401).send({ error: 'invalid ingest token' });
  const bind = await bindOrCheckLogin(acct, b.account_id);
  if (bind === 'mismatch') return reply.code(403).send({ error: 'token does not match this MT5 account' });
  if (bind === 'conflict') return reply.code(409).send({ error: 'MT5 login already registered to another account' });

  const inserted = await upsertCandles(normalizeSymbol(b.symbol), b.candles);
  if (b.request_id != null && b.final) await markRequestDone(b.request_id, b.account_id);
  return reply.code(201).send({ inserted });
});

// The EA polls this for replay windows to fill. Plain text — one request per
// line, `id;symbol;from_epoch;to_epoch` (UTC seconds) — because MQL5 has no
// JSON parser and the EA already speaks semicolon-delimited lines.
app.get('/api/candles/requests', async (req, reply) => {
  const token = req.headers['x-ingest-token'];
  if (!token) return reply.code(401).send({ error: 'missing ingest token' });
  const acct = await accountByToken(token);
  if (!acct) return reply.code(401).send({ error: 'invalid ingest token' });
  const login = Number(req.query.account_id);
  if (!Number.isFinite(login)) return reply.code(400).send({ error: 'account_id required' });
  const bind = await bindOrCheckLogin(acct, login);
  if (bind === 'mismatch') return reply.code(403).send({ error: 'token does not match this MT5 account' });
  if (bind === 'conflict') return reply.code(409).send({ error: 'MT5 login already registered to another account' });

  const reqs = await pendingRequestsForLogin(login);
  reply.header('Content-Type', 'text/plain; charset=utf-8');
  return reqs
    .map((r) => `${r.id};${r.symbol};${Math.floor(r.from_epoch)};${Math.floor(r.to_epoch)}`)
    .join('\n');
});

// Replay data for one trade: the M1 bars around its window + the overlay
// fields (entry/exit/SL/TP). When coverage is missing for a live (EA) trade a
// candle request is queued for its EA and `pending: true` tells the client to
// re-poll; imported/manual trades have no prices to chart → `available: false`.
app.get('/api/trades/:id/replay', { preHandler: app.requireAuth }, async (req, reply) => {
  const id = Number(req.params.id);
  const ownerId = await tradeOwnerUserId(id);
  if (ownerId == null) return reply.code(404).send({ error: 'trade not found' });
  if (ownerId !== Number(req.user.uid)) return reply.code(403).send({ error: 'forbidden' });

  const { rows } = await query('SELECT * FROM trades WHERE id = $1', [id]);
  const trade = rows[0];

  if (
    trade.entry_price == null ||
    trade.exit_price == null ||
    new Date(trade.close_time) <= new Date(trade.open_time)
  ) {
    return { available: false, reason: 'trade has no price/time data (imported or manual entry)' };
  }

  const { from, to } = replayWindow(trade);
  const candles = await listCandles(trade.symbol_base, from, to);
  // Covered = bars reach both edges of the trade itself (the padding may be
  // truncated by market open/close, so don't require it).
  const covered =
    candles.length > 0 &&
    candles[0].t * 1000 <= new Date(trade.open_time).getTime() &&
    candles[candles.length - 1].t * 1000 >= new Date(trade.close_time).getTime() - 60_000;

  let pending = false;
  if (!covered && trade.source === 'ea' && trade.account_id != null) {
    let status = await windowRequestStatus(trade);
    if (status == null) {
      await enqueueCandleRequest(trade);
      status = 'pending';
    }
    pending = status === 'pending';
  }

  return {
    available: true,
    pending,
    window: { from: from.toISOString(), to: to.toISOString() },
    trade: {
      id: trade.id,
      symbol: trade.symbol_base ?? trade.symbol,
      direction: trade.direction,
      open_time: trade.open_time,
      close_time: trade.close_time,
      entry_price: trade.entry_price,
      sl_price: trade.sl_price,
      tp_price: trade.tp_price,
      exit_price: trade.exit_price,
    },
    candles,
  };
});

// ---------------------------------------------------------------------------
// EA download — serves the MQL5 source so users can grab the EA straight from
// the setup card. No secret in the file (the ingest token is entered per
// account in MT5), so this is public. `ea/` is deployed alongside the backend.
// ---------------------------------------------------------------------------
const EA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ea', 'AmeyJournal.mq5');
app.get('/api/ea/download', async (req, reply) => {
  try {
    const src = await readFile(EA_FILE, 'utf8');
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="AmeyJournal.mq5"');
    return src;
  } catch {
    return reply.code(404).send({ error: 'EA file not available' });
  }
});

// ---------------------------------------------------------------------------
// Accounts — the user's MT5 accounts (for the switcher + account box).
// ---------------------------------------------------------------------------
app.get('/api/accounts', { preHandler: app.requireAuth }, async (req) =>
  listAccounts(req.user.uid)
);

// Create an account. kind='manual' (default) makes a no-sync bucket for manual/
// CSV trades — available on every plan so users can segregate their journal per
// account. kind='synced' provisions an EA ingest token and is the Pro+ gate.
app.post('/api/accounts', { preHandler: app.requireAuth }, async (req, reply) => {
  const plan = await planForUser(req.user.uid);
  const kind = req.body?.kind === 'synced' ? 'synced' : 'manual';
  if (kind === 'synced') {
    // Plan gate: a live-synced MT5 account is a Pro+ feature, capped per plan.
    const limit = accountLimit(plan);
    if (await syncedAccountCount(req.user.uid) >= limit) {
      return reply.code(402).send({
        error: limit === 0
          ? 'Connecting a trading account for live EA sync requires the Pro plan'
          : `Your plan allows up to ${limit} synced accounts — upgrade to add more`,
      });
    }
  } else {
    const limit = manualAccountLimit(plan);
    if (await manualAccountCount(req.user.uid) >= limit) {
      return reply.code(402).send({ error: `Your plan allows up to ${limit} manual accounts` });
    }
  }
  const { label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct } = req.body ?? {};
  const acct = await createAccount(req.user.uid, {
    label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, kind,
  });
  // Every account tracks an active challenge from the moment it exists, so the
  // Prop OS module has state to show (seeded from the account's rule template).
  await createChallengeForAccount(acct.id);
  return reply.code(201).send(acct);
});

// Edit account metadata (label / broker / currency / start_balance).
app.patch('/api/accounts/:id', { preHandler: app.requireAuth }, async (req, reply) => {
  const acct = await updateAccount(req.user.uid, Number(req.params.id), req.body ?? {});
  if (!acct) return reply.code(404).send({ error: 'account not found' });
  // Mirror any changed rule fields onto the active challenge so Prop OS reflects
  // the correction immediately (ownership already enforced by updateAccount).
  await syncActiveChallengeRules(Number(req.params.id), req.body ?? {});
  if (acct.mt5_login != null) io.to(`acct:${acct.mt5_login}`).emit('prop:updated', { account_id: acct.mt5_login });
  return acct;
});

// Delete an account (its trades keep account_id but become unowned).
app.delete('/api/accounts/:id', { preHandler: app.requireAuth }, async (req, reply) => {
  const ok = await deleteAccount(req.user.uid, Number(req.params.id));
  if (!ok) return reply.code(404).send({ error: 'account not found' });
  return { id: Number(req.params.id), deleted: true };
});

// ---------------------------------------------------------------------------
// Strategies — the user's managed strategy catalog (named setups). A trade is
// linked to its strategy by name (trades.setup). All routes are scoped to the
// requesting user; renames cascade to their trades (see strategies.js).
// ---------------------------------------------------------------------------
app.get('/api/strategies', { preHandler: app.requireAuth }, async (req) =>
  listStrategies(req.user.uid)
);

app.post('/api/strategies', { preHandler: app.requireAuth }, async (req, reply) => {
  try {
    const s = await createStrategy(req.user.uid, req.body ?? {});
    return reply.code(201).send(s);
  } catch (err) {
    if (err.code === 'INVALID') return reply.code(400).send({ error: err.message });
    if (err.code === 'DUP') return reply.code(409).send({ error: err.message });
    throw err;
  }
});

app.patch('/api/strategies/:id', { preHandler: app.requireAuth }, async (req, reply) => {
  try {
    const s = await updateStrategy(req.user.uid, Number(req.params.id), req.body ?? {});
    if (!s) return reply.code(404).send({ error: 'strategy not found' });
    return s;
  } catch (err) {
    if (err.code === 'INVALID') return reply.code(400).send({ error: err.message });
    if (err.code === 'DUP') return reply.code(409).send({ error: err.message });
    throw err;
  }
});

app.delete('/api/strategies/:id', { preHandler: app.requireAuth }, async (req, reply) => {
  const ok = await deleteStrategy(req.user.uid, Number(req.params.id));
  if (!ok) return reply.code(404).send({ error: 'strategy not found' });
  return { id: Number(req.params.id), deleted: true };
});

// ---------------------------------------------------------------------------
// Payouts — profit withdrawals on FUNDED accounts. Scoped like trades/account:
// a specific account returns its payouts, the god view returns all owned ones.
// ---------------------------------------------------------------------------
app.get('/api/payouts', { preHandler: app.requireAuth }, async (req, reply) => {
  const scope = await resolveScope(req.user.uid, req.query.account_id);
  if (!scope) return reply.code(403).send({ error: 'account not found' });
  return listPayouts(scope.logins);
});

// Record a manual payout for one of the user's funded accounts. `account_id` is
// the MT5 login; `split_pct` defaults to the account's configured trader split.
app.post('/api/payouts', { preHandler: app.requireAuth }, async (req, reply) => {
  const b = req.body ?? {};
  const login = Number(b.account_id);
  const acct = Number.isNaN(login) ? null : await ownedAccountByLogin(req.user.uid, login);
  if (!acct) return reply.code(404).send({ error: 'account not found' });

  const gross = Number(b.gross_amount);
  if (!Number.isFinite(gross) || gross <= 0) return reply.code(400).send({ error: 'gross_amount must be a positive number' });
  const split = b.split_pct == null || b.split_pct === '' ? Number(acct.payout_split_pct) : Number(b.split_pct);
  if (!Number.isFinite(split) || split < 0 || split > 100) return reply.code(400).send({ error: 'split_pct must be 0–100' });
  const when = b.payout_date ? new Date(b.payout_date) : new Date();
  if (isNaN(when.getTime())) return reply.code(400).send({ error: 'invalid payout_date' });

  const payout = await createPayout(req.user.uid, {
    account_id: login, payout_date: when.toISOString(), gross_amount: gross, split_pct: split, note: b.note,
  });
  io.to(`acct:${login}`).emit('payout:updated', { account_id: login });
  return reply.code(201).send(payout);
});

app.delete('/api/payouts/:id', { preHandler: app.requireAuth }, async (req, reply) => {
  const ok = await deletePayout(req.user.uid, Number(req.params.id));
  if (!ok) return reply.code(404).send({ error: 'payout not found' });
  return { id: Number(req.params.id), deleted: true };
});

// EA ingest: a withdrawal auto-detected from an MT5 balance operation (a
// DEAL_TYPE_BALANCE deal with negative profit). Token-authed like the trade
// ingest; idempotent by (account_id, deal_ticket) via recordEaPayout's upsert.
// `amount` is the gross withdrawn (positive); the trader's split comes from the
// account's configured payout_split_pct.
app.post('/api/payouts/ingest', async (req, reply) => {
  const b = req.body ?? {};
  const token = req.headers['x-ingest-token'];
  if (!token) return reply.code(401).send({ error: 'missing ingest token' });
  const acct = await accountByToken(token);
  if (!acct) return reply.code(401).send({ error: 'invalid ingest token' });
  // Same Pro+ gate as trade ingest (EA-sourced payout auto-detection).
  if (!canUseEA(await planForUser(acct.user_id))) {
    return reply.code(402).send({ error: 'EA sync requires the Pro plan' });
  }

  const login = Number(b.account_id);
  const bind = await bindOrCheckLogin(acct, login);
  if (bind === 'mismatch') return reply.code(403).send({ error: 'token does not match this MT5 account' });
  if (bind === 'conflict') return reply.code(409).send({ error: 'MT5 login already registered to another account' });

  const gross = Number(b.amount);
  if (!Number.isFinite(gross) || gross <= 0) return reply.code(400).send({ error: 'amount must be a positive number' });
  if (b.deal_ticket == null || b.deal_ticket === '') return reply.code(400).send({ error: 'deal_ticket required' });
  const when = b.time ? new Date(b.time) : new Date();
  if (isNaN(when.getTime())) return reply.code(400).send({ error: 'invalid time' });

  const payout = await recordEaPayout({
    account_id: login,
    user_id: Number(acct.user_id),
    payout_date: when.toISOString(),
    gross_amount: gross,
    split_pct: Number(acct.payout_split_pct),
    ext_ref: b.deal_ticket,
    note: b.comment || null,
  });
  if (payout) io.to(`acct:${login}`).emit('payout:updated', { account_id: login });
  return reply.code(payout ? 201 : 200).send(payout || { deduped: true });
});

// ---------------------------------------------------------------------------
// Account — balance/equity for the selected account, or an aggregate for the
// god view. Returns null when the user has no accounts in scope.
// ---------------------------------------------------------------------------
app.get('/api/account', { preHandler: app.requireAuth }, async (req, reply) => {
  const scope = await resolveScope(req.user.uid, req.query.account_id);
  if (!scope) return reply.code(403).send({ error: 'account not found' });

  const inScope = (await listAccounts(req.user.uid)).filter((a) => scope.logins.includes(a.mt5_login));
  if (!inScope.length) return null;

  // A single selected account: return its snapshot directly.
  if (!scope.god && inScope.length === 1) return inScope[0];

  // God / multi-account: aggregate. Balances summed only if any are live.
  const sum = (f) => inScope.reduce((s, a) => s + (Number(a[f]) || 0), 0);
  const anyLive = inScope.some((a) => a.balance != null);
  return {
    god: true,
    accounts: inScope,
    start_balance: sum('start_balance'),
    balance: anyLive ? sum('balance') : null,
    equity: anyLive ? sum('equity') : null,
  };
});

// ---------------------------------------------------------------------------
// Prop OS — challenge / drawdown / rule state for the selected account, or a
// portfolio (one card per account) for the god view. Computed by src/prop.js over
// the account's active challenge + trades + payouts + EA equity snapshots. All in
// account currency ($). Scoped like /api/account.
// ---------------------------------------------------------------------------
app.get('/api/prop', { preHandler: app.requireAuth }, async (req, reply) => {
  const scope = await resolveScope(req.user.uid, req.query.account_id);
  if (!scope) return reply.code(403).send({ error: 'account not found' });
  const logins = scope.logins;
  if (!logins.length) return scope.god ? { god: true, accounts: [] } : null;

  // Bulk-fetch once, compute per account in JS (a few queries, not N).
  const [challenges, trades, snaps, payouts, accts] = await Promise.all([
    activeChallengesByLogin(logins),
    tradesForEngine(logins),
    equitySnapshotsForEngine(logins),
    listPayouts(logins),
    listAccounts(req.user.uid),
  ]);
  const asOf = new Date();
  const acctByLogin = new Map(accts.map((a) => [a.mt5_login, a]));
  const groupBy = (arr) => {
    const m = new Map();
    for (const x of arr) { if (!m.has(x.account_id)) m.set(x.account_id, []); m.get(x.account_id).push(x); }
    return m;
  };
  const tByLogin = groupBy(trades);
  const sByLogin = groupBy(snaps);
  const pByLogin = groupBy(payouts);

  const build = (login) => {
    const acct = acctByLogin.get(login);
    const challenge = challenges.get(login);
    const meta = { account_id: login, label: acct?.label ?? null, currency: acct?.currency ?? 'USD' };
    if (!challenge) return { ...meta, challenge: null };
    const live = acct?.equity ?? acct?.balance ?? null;
    const state = challengeState({
      challenge,
      trades: tByLogin.get(login) ?? [],
      payouts: pByLogin.get(login) ?? [],
      snapshots: sByLogin.get(login) ?? [],
      live,
      asOf,
    });
    return { ...meta, challengeId: challenge.id, ...state };
  };

  if (!scope.god) return build(logins[0]);
  return { god: true, accounts: logins.map(build) };
});

// Challenge phase history for one owned account (the phase timeline).
app.get('/api/prop/history', { preHandler: app.requireAuth }, async (req, reply) => {
  const login = Number(req.query.account_id);
  if (Number.isNaN(login)) return reply.code(400).send({ error: 'account_id required' });
  if (!(await ownedAccountByLogin(req.user.uid, login))) return reply.code(404).send({ error: 'account not found' });
  return challengeHistory(req.user.uid, login);
});

// Advance/reset an account's challenge: close the active one (passed|breached) and
// open a fresh active challenge for `to_phase`, seeded from the account template.
app.post('/api/prop/advance', { preHandler: app.requireAuth }, async (req, reply) => {
  const b = req.body ?? {};
  const login = Number(b.account_id);
  if (Number.isNaN(login)) return reply.code(400).send({ error: 'account_id required' });
  if (!['p1', 'p2', 'funded'].includes(b.to_phase)) {
    return reply.code(400).send({ error: 'to_phase must be p1, p2, or funded' });
  }
  const mark = b.mark === 'breached' ? 'breached' : 'passed';
  const ch = await advanceChallenge(req.user.uid, login, {
    toPhase: b.to_phase, mark, breachReason: b.breach_reason ?? null,
  });
  if (!ch) return reply.code(404).send({ error: 'account not found' });
  io.to(`acct:${login}`).emit('prop:updated', { account_id: login });
  // Milestone: record the pass/reset as a notification.
  const created = await insertNotifications(req.user.uid, [phasePassedAlert({
    accountId: login, label: ch.label, fromPhase: ch.previousPhase, toPhase: ch.phase, challengeId: ch.id,
  })]);
  for (const n of created) io.to(`user:${req.user.uid}`).emit('notification:new', n);
  return reply.code(201).send(ch);
});

// ---------------------------------------------------------------------------
// Notifications — in-app alert feed for the logged-in user. Generated by the
// evaluator on live ingests (rule breaches, proximity warnings, milestones);
// delivered live over the user's socket room as `notification:new`.
// ---------------------------------------------------------------------------
app.get('/api/notifications', { preHandler: app.requireAuth }, async (req) =>
  listNotifications(req.user.uid, Math.min(Number(req.query.limit) || 50, 200))
);

app.post('/api/notifications/read', { preHandler: app.requireAuth }, async (req) => {
  const b = req.body ?? {};
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isFinite) : null;
  const unread = await markRead(req.user.uid, { ids, all: !!b.all });
  return { unread };
});

// ---------------------------------------------------------------------------
// Dashboard analytics — scoped to the selected account (or all owned = god).
// ---------------------------------------------------------------------------
// god / all-accounts view reports R; a single account reports its currency ($).
// Display unit + global data filters are chosen by the client (per scope), not
// derived from the account. Unit is normalized to R/USD; filter values are
// parameterized in buildTradeWhere.
const parseUnit = (q) => (q.unit === 'USD' ? 'USD' : 'R');
// Precision control (Trade Settings): snap near-zero Fixed R to breakeven.
const parseBeRound = (q) => q.beRound === '1' || q.beRound === 'true';
const csv = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
const parseFilters = (q) => ({
  setups: csv(q.setups),
  symbols: csv(q.symbols),
  sessions: csv(q.sessions),
  probability: csv(q.probability),
  outcome: csv(q.outcome),
  from: q.from || null,
  to: q.to || null,
});

app.get('/api/stats', { preHandler: app.requireAuth }, async (req, reply) => {
  const scope = await resolveScope(req.user.uid, req.query.account_id);
  if (!scope) return reply.code(403).send({ error: 'account not found' });
  return computeStats(scope, parseUnit(req.query), parseFilters(req.query), parseBeRound(req.query));
});

app.get('/api/yearly', { preHandler: app.requireAuth }, async (req, reply) => {
  const scope = await resolveScope(req.user.uid, req.query.account_id);
  if (!scope) return reply.code(403).send({ error: 'account not found' });
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  return computeYearly(year, scope, parseUnit(req.query), parseFilters(req.query), parseBeRound(req.query));
});

// ---------------------------------------------------------------------------
// Billing (Razorpay recurring subscriptions). Everything degrades to 503 when
// payments aren't configured, so the app runs exactly as before until keys are
// set. Pro is the only purchasable plan for now.
// ---------------------------------------------------------------------------

// Public config for the checkout UI: whether payments are live + the publishable
// key id (safe to expose; the secret never leaves the server).
app.get('/api/billing/config', async () => ({
  enabled: paymentsEnabled(),
  keyId: config.razorpayKeyId || null,
}));

// The current user's latest subscription state (for the Billing page).
app.get('/api/billing/subscription', { preHandler: app.requireAuth }, async (req) => {
  const { rows } = await query(
    `SELECT razorpay_subscription_id, plan, status, current_end
       FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [req.user.uid]
  );
  return { subscription: rows[0] ?? null };
});

// Start a Pro subscription at Razorpay, persist a pending row, return what the
// frontend Checkout needs.
app.post('/api/billing/subscribe', { preHandler: app.requireAuth }, async (req, reply) => {
  if (!paymentsEnabled()) return reply.code(503).send({ error: 'payments are not configured yet' });
  const plan = req.body?.plan || 'pro';
  if (plan !== 'pro') return reply.code(400).send({ error: 'only the Pro plan is purchasable right now' });
  if (!config.razorpayPlanPro) return reply.code(503).send({ error: 'the Pro plan is not configured' });

  let sub;
  try {
    sub = await createSubscription({ userId: req.user.uid, planId: config.razorpayPlanPro });
  } catch (err) {
    req.log.error({ err: err.message }, 'razorpay subscribe failed');
    return reply.code(502).send({ error: 'could not start subscription' });
  }
  await query(
    `INSERT INTO subscriptions (user_id, razorpay_subscription_id, plan, status)
     VALUES ($1, $2, 'pro', $3) ON CONFLICT (razorpay_subscription_id) DO NOTHING`,
    [req.user.uid, sub.id, sub.status || 'created']
  );
  return { subscription_id: sub.id, key_id: config.razorpayKeyId, short_url: sub.short_url };
});

// Cancel the active subscription at cycle end; the webhook then downgrades.
app.post('/api/billing/cancel', { preHandler: app.requireAuth }, async (req, reply) => {
  if (!paymentsEnabled()) return reply.code(503).send({ error: 'payments are not configured yet' });
  const { rows } = await query(
    `SELECT razorpay_subscription_id FROM subscriptions
      WHERE user_id = $1 AND status NOT IN ('cancelled','completed','expired')
      ORDER BY created_at DESC LIMIT 1`,
    [req.user.uid]
  );
  if (!rows.length) return reply.code(404).send({ error: 'no active subscription' });
  try {
    await cancelSubscription(rows[0].razorpay_subscription_id, true);
  } catch (err) {
    req.log.error({ err: err.message }, 'razorpay cancel failed');
    return reply.code(502).send({ error: 'could not cancel subscription' });
  }
  return { ok: true, message: 'subscription will cancel at the end of the current billing cycle' };
});

// Razorpay webhook. No session auth — authenticity IS the HMAC signature over the
// raw body. Only verified events change any plan.
app.post('/api/billing/webhook', { config: { rateLimit: false } }, async (req, reply) => {
  if (!paymentsEnabled()) return reply.code(503).send({ error: 'payments not configured' });
  if (!verifyWebhookSignature(req.rawBody, req.headers['x-razorpay-signature'], config.razorpayWebhookSecret)) {
    return reply.code(400).send({ error: 'invalid signature' });
  }
  const state = planStateFromEvent(req.body, { pro: config.razorpayPlanPro });
  if (!state) return { ok: true, ignored: true }; // event we don't act on

  // Resolve the owning user: our sub→user row (authoritative), else notes.user_id.
  const subId = state.subscriptionId;
  const { rows } = await query('SELECT user_id FROM subscriptions WHERE razorpay_subscription_id = $1', [subId]);
  const noteUid = req.body?.payload?.subscription?.entity?.notes?.user_id;
  const userId = rows[0]?.user_id ?? (noteUid ? Number(noteUid) : null);
  if (userId == null) {
    req.log.warn({ subId }, 'billing webhook for unknown subscription — no user mapping');
    return { ok: true, unmapped: true };
  }

  // Idempotent: upsert the subscription state, then set the user's effective plan.
  // The subscription row keeps its tier ('pro') even on downgrade; users.plan
  // becomes 'free' on terminal events.
  await query(
    `INSERT INTO subscriptions (user_id, razorpay_subscription_id, plan, status, current_end)
     VALUES ($1, $2, 'pro', $3, $4)
     ON CONFLICT (razorpay_subscription_id)
     DO UPDATE SET status = EXCLUDED.status, current_end = EXCLUDED.current_end`,
    [userId, subId, state.status, state.currentEnd]
  );
  await query('UPDATE users SET plan = $2 WHERE id = $1', [userId, state.plan]);
  req.log.info({ userId, plan: state.plan, event: req.body?.event }, 'billing webhook applied');
  return { ok: true };
});

// ---------------------------------------------------------------------------
const start = async () => {
  try {
    assertProdSecrets();
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
