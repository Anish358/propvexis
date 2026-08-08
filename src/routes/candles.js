import { query } from '../platform/db.js';
import { tradeOwnerUserId, accountByToken, bindOrCheckLogin } from '../domain/accounts/accounts.js';
import { insertEquitySnapshots } from '../domain/prop/challenges.js';
import { planForUser } from '../domain/billing/entitlements.js';
import { canUseEA } from '../domain/billing/plans.js';
import { replayWindow, enqueueCandleRequest, pendingRequestsForLogin, markRequestDone, upsertCandles, listCandles, windowRequestStatus } from '../domain/trades/candles.js';
import { normalizeSymbol } from '../domain/trades/derive.js';

/**
 * EA telemetry that is not a trade: the equity/balance feed behind the prop
 * engine, and the M1 candle exchange that powers trade replay ($0 data cost — the
 * EA serves the windows the server asks for).
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function candleRoutes(app, ctx) {
  const { io, runAlerts } = ctx;

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
}
