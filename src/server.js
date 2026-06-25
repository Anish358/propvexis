import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as IOServer } from 'socket.io';
import { config } from './config.js';
import { pool, query } from './db.js';
import { computeStats, computeYearly } from './aggregations.js';
import {
  priceToPips,
  deriveSession,
  deriveFixedR,
  deriveMaxR,
  normalizeSymbol,
  round2,
} from './derive.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

// Socket.IO shares Fastify's underlying HTTP server.
const io = new IOServer(app.server, { cors: { origin: config.corsOrigin } });
io.on('connection', (socket) => {
  app.log.info({ id: socket.id }, 'client connected');
});

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
app.get('/health', async () => {
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
  // Auth: shared secret from the EA.
  if (req.headers['x-ingest-token'] !== config.ingestToken) {
    return reply.code(401).send({ error: 'invalid ingest token' });
  }

  const b = req.body;

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
  const PRESERVE_IF_NULL = new Set(['mfe_pips', 'max_r']);
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

  io.emit('trade:upserted', trade);

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
    io.emit('account:updated', accRows[0]);
  }

  return reply.code(201).send(trade);
});

// ---------------------------------------------------------------------------
// List trades (newest first). Optional filters: ?tagged=false&limit=100
// ---------------------------------------------------------------------------
app.get('/api/trades', async (req) => {
  const { tagged, limit = 200 } = req.query;
  const where = [];
  const params = [];
  if (tagged === 'true' || tagged === 'false') {
    params.push(tagged === 'true');
    where.push(`tagged = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 200, 1000));
  const sql = `
    SELECT * FROM trades
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY close_time DESC
    LIMIT $${params.length};
  `;
  const { rows } = await query(sql, params);
  return rows;
});

// ---------------------------------------------------------------------------
// Tag a trade (user fills discretionary fields). Marks tagged = true.
// ---------------------------------------------------------------------------
// Editable numeric metrics. Editing either recomputes max_r = mfe / sl.
const METRIC_FIELDS = ['sl_size_pips', 'mfe_pips'];

app.patch('/api/trades/:id', async (req, reply) => {
  const id = Number(req.params.id);
  const updates = [];
  const params = [];

  for (const f of TAG_FIELDS) {
    if (f in req.body) {
      params.push(req.body[f]);
      updates.push(`${f} = $${params.length}`);
    }
  }

  // SL size / MFE edits: validate, then recompute Max R from the merged values.
  if (METRIC_FIELDS.some((f) => f in req.body)) {
    const { rows: cur } = await query('SELECT sl_size_pips, mfe_pips FROM trades WHERE id = $1', [id]);
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
  }

  if (!updates.length) {
    return reply.code(400).send({ error: 'no editable fields provided' });
  }
  updates.push('tagged = TRUE');
  params.push(id);

  const sql = `UPDATE trades SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *;`;
  const { rows } = await query(sql, params);
  if (!rows.length) return reply.code(404).send({ error: 'trade not found' });

  io.emit('trade:updated', rows[0]);
  return rows[0];
});

// ---------------------------------------------------------------------------
// Delete a trade.
// ---------------------------------------------------------------------------
app.delete('/api/trades/:id', async (req, reply) => {
  const id = Number(req.params.id);
  const { rows } = await query('DELETE FROM trades WHERE id = $1 RETURNING id', [id]);
  if (!rows.length) return reply.code(404).send({ error: 'trade not found' });

  io.emit('trade:deleted', { id });
  return { id, deleted: true };
});

// ---------------------------------------------------------------------------
// Account — latest live balance/equity snapshot (single prop account).
// Returns null when the EA hasn't reported a balance yet.
// ---------------------------------------------------------------------------
app.get('/api/account', async () => {
  const { rows } = await query('SELECT * FROM accounts ORDER BY updated_at DESC LIMIT 1');
  return rows[0] ?? null;
});

// ---------------------------------------------------------------------------
// Dashboard analytics
// ---------------------------------------------------------------------------
app.get('/api/stats', async () => computeStats());

app.get('/api/yearly', async (req) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  return computeYearly(year);
});

// ---------------------------------------------------------------------------
const start = async () => {
  try {
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
