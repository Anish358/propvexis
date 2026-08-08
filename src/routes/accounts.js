import { resolveScope, listAccounts, createAccount, updateAccount, deleteAccount, stripNullProfitTarget } from '../domain/accounts/accounts.js';
import { createChallengeForAccount, syncActiveChallengeRules } from '../domain/prop/challenges.js';
import { planForUser, syncedAccountCount, manualAccountCount } from '../domain/billing/entitlements.js';
import { accountLimit, manualAccountLimit } from '../domain/billing/plans.js';

/**
 * The user's MT5 accounts — CRUD for the switcher and the account box, plus
 * the single-account summary the header reads.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function accountRoutes(app, ctx) {
  const { io } = ctx;

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
    const { label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days } = req.body ?? {};
    const acct = await createAccount(req.user.uid, {
      label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, kind,
    });
    // Every account tracks an active challenge from the moment it exists, so the
    // Prop OS module has state to show (seeded from the account's rule template).
    await createChallengeForAccount(acct.id);
    return reply.code(201).send(acct);
  });

  // Edit account metadata (label / broker / currency / start_balance).
  app.patch('/api/accounts/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const body = req.body ?? {};
    const acct = await updateAccount(req.user.uid, Number(req.params.id), stripNullProfitTarget(body));
    if (!acct) return reply.code(404).send({ error: 'account not found' });
    // Mirror any changed rule fields onto the active challenge so Prop OS reflects
    // the correction immediately (ownership already enforced by updateAccount).
    await syncActiveChallengeRules(Number(req.params.id), body);
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
}
