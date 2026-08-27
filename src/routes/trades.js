import { config } from '../platform/config.js';
import { pool, query } from '../platform/db.js';
import { resolveScope, scopeCondition, tradeOwnerUserId, accountByToken, bindOrCheckLogin, ownedAccountByLogin } from '../domain/accounts/accounts.js';
import { planForUser } from '../domain/billing/entitlements.js';
import { canUseEA } from '../domain/billing/plans.js';
import { parseCsv, buildImportTrades } from '../domain/trades/csv.js';
import { adherenceOf } from '../domain/trades/adherence.js';
import { enqueueCandleRequest } from '../domain/trades/candles.js';
import { priceToPips, pipSize, deriveSession, deriveFixedR, deriveMaxR, normalizeSymbol, round2 } from '../domain/trades/derive.js';

/**
 * The trade record itself: EA ingest, listing, manual create, CSV import,
 * tagging and delete. The ingest route is the only unauthenticated one — it
 * authenticates by per-account token instead of a session (see accounts.js).
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function tradeRoutes(app, ctx) {
  const { io, emitTrade, runAlerts, invalidateStats, rulesMapFor } = ctx;

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
    const params = [];
    const add = (v) => { params.push(v); return `$${params.length}`; };
    const where = [scopeCondition(scope, add)];
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
    // A HAND-ENTERED TRADE CAN PASS OR BREACH A PHASE, exactly as an EA one can, so it
    // must be re-evaluated too. This call was missing when the phase status became
    // automatic (2026-08-27): only /api/trades/ingest ran it, so a trader who typed in
    // three winning trades met their target, met their trading days, and watched Prop OS
    // go on saying Phase 1 — the engine had simply never been asked.
    if (account_id != null) await runAlerts(req.user.uid, account_id);
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
      invalidateStats(req.user.uid);
      // Same reason as the manual add: an imported statement is a month of trades
      // arriving at once, and it can carry an account clean through its target. Once
      // per import rather than per row — the engine reads the account's whole history
      // every time it runs, so N calls would compute the same verdict N times.
      if (acctLogin != null) await runAlerts(req.user.uid, acctLogin);
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
    // An EDIT moves the numbers as surely as an insert does — correcting an SL rescales
    // fixed_r, and correcting a P&L moves the equity curve the drawdown floor is measured
    // against. It can also move them BACK, which is why the evaluator is idempotent
    // rather than one-way: it writes a transition once and re-reads it as a no-op.
    if (trade.account_id != null) await runAlerts(req.user.uid, trade.account_id);
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
    invalidateStats(t.user_id);
    // Deleting the trade that crossed the target does NOT un-pass the phase, and that is
    // deliberate rather than an oversight: applyChallengeOutcome only ever closes an
    // ACTIVE row, so a settled phase stays settled and needs the manual override to
    // reopen. What this call is for is the account still running — a mistaken loss
    // removed should give back the drawdown room it took.
    if (t.account_id != null) await runAlerts(t.user_id, t.account_id);
    return { id, deleted: true };
  });
}
