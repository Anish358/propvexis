import { resolveScope, accountByToken, bindOrCheckLogin, ownedAccountByLogin } from '../domain/accounts/accounts.js';
import { listPayouts, createPayout, deletePayout, recordEaPayout } from '../domain/finance/payouts.js';
import { listFees, createFee, deleteFee, FEE_TYPES } from '../domain/finance/fees.js';
import { planForUser } from '../domain/billing/entitlements.js';
import { canUseEA } from '../domain/billing/plans.js';

/**
 * Money in and out of a funded account: payouts (with the trader's split) and
 * challenge fees. Includes the EA's automatic payout detection.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function payoutRoutes(app, ctx) {
  const { io } = ctx;

  // ---------------------------------------------------------------------------
  // Payouts — profit withdrawals on FUNDED accounts. Scoped like trades/account:
  // a specific account returns its payouts, 'all' returns every active account's.
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

  // ---------------------------------------------------------------------------
  // Fees — money OUT: evaluation / reset / activation fees paid to a prop firm.
  // The mirror of payouts; together they drive the Prop OS finance summary (true
  // ROI). Scoped like payouts; manual entry only for now.
  // ---------------------------------------------------------------------------
  app.get('/api/fees', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    return listFees(scope.logins);
  });

  app.post('/api/fees', { preHandler: app.requireAuth }, async (req, reply) => {
    const b = req.body ?? {};
    const login = Number(b.account_id);
    const acct = Number.isNaN(login) ? null : await ownedAccountByLogin(req.user.uid, login);
    if (!acct) return reply.code(404).send({ error: 'account not found' });

    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) return reply.code(400).send({ error: 'amount must be a positive number' });
    const feeType = FEE_TYPES.includes(b.fee_type) ? b.fee_type : 'evaluation';
    const when = b.fee_date ? new Date(b.fee_date) : new Date();
    if (isNaN(when.getTime())) return reply.code(400).send({ error: 'invalid fee_date' });

    const fee = await createFee(req.user.uid, {
      account_id: login, fee_date: when.toISOString(), amount, fee_type: feeType, note: b.note,
    });
    io.to(`acct:${login}`).emit('fee:updated', { account_id: login });
    return reply.code(201).send(fee);
  });

  app.delete('/api/fees/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const ok = await deleteFee(req.user.uid, Number(req.params.id));
    if (!ok) return reply.code(404).send({ error: 'fee not found' });
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
}
