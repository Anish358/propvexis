import { resolveScope, listAccounts, createAccount, updateAccount, deleteAccount, stripNullProfitTarget, ownedAccountByLogin } from '../domain/accounts/accounts.js';
import { createChallengeForAccount, syncActiveChallengeRules } from '../domain/prop/challenges.js';
import { planForUser, syncedAccountCount, manualAccountCount } from '../domain/billing/entitlements.js';
import { accountLimit, manualAccountLimit } from '../domain/billing/plans.js';
import { validateProvision, provisionGate, provisionAccount, PROVISION_CONFLICT } from '../domain/accounts/provision.js';
import { getConnector } from '../domain/sync/connectors/index.js';
import { credentialsEnabled } from '../domain/sync/credentials.js';
import { query } from '../platform/db.js';

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
    const { label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct, profit_target_pct, payout_split_pct, dd_type, min_trading_days, firm_id, firm_name, product_id } = req.body ?? {};
    // Absent means prop, which is what every account created before capital_kind
    // existed is — so an old client keeps its current behaviour exactly.
    const capital_kind = req.body?.capital_kind === 'live' ? 'live' : 'prop';
    const acct = await createAccount(req.user.uid, {
      label, broker, currency, start_balance, account_type, daily_dd_pct, max_dd_pct,
      profit_target_pct, payout_split_pct, dd_type, min_trading_days,
      firm_id, firm_name, product_id, capital_kind, kind,
    });
    // Every PROP account tracks an active challenge from the moment it exists, so
    // Prop OS has state to show. A live account must NOT get one: it has no firm
    // rules, and an invented 5/10/8 challenge is what made own-capital accounts
    // read as evaluations with a profit target they do not have.
    if (capital_kind === 'prop') await createChallengeForAccount(acct.id);
    return reply.code(201).send(acct);
  });

  /**
   * Is this platform login free to use? The credential step calls this while the
   * user types, so a collision is reported before they have typed a password
   * rather than as a 409 at the end of a nine-step flow.
   *
   * DELIBERATELY BLUNT: it answers "available" and, only when the login belongs to
   * the CALLER, "mine". Saying anything about another tenant's account would make
   * this an oracle for enumerating other traders' MT5 logins. The unique index at
   * commit remains the real guard — this is UX, and two users racing one login
   * still means one of them gets the 409.
   */
  app.get('/api/accounts/login-available', { preHandler: app.requireAuth }, async (req, reply) => {
    // `platform` is part of the query contract but deliberately UNREAD here.
    // mt5_accounts.mt5_login is globally UNIQUE (not unique per platform), so a
    // per-platform lookup would be answering a question the schema does not ask —
    // do not "fix" this into a scoped query without changing that constraint first.
    const login = Number(req.query?.login);
    if (!Number.isInteger(login) || login <= 0) {
      return reply.code(400).send({ error: 'a positive login is required' });
    }
    const mine = await ownedAccountByLogin(req.user.uid, login);
    if (mine) return reply.send({ available: false, mine: true, account_id: mine.id });
    const { rows } = await query('SELECT 1 FROM mt5_accounts WHERE mt5_login = $1', [login]);
    return reply.send({ available: rows.length === 0, mine: false });
  });

  /**
   * Create an account and everything that must exist with it, atomically.
   *
   * This is what the Add Account flow calls. The older POST /api/accounts stays
   * for the edit/legacy path, but it cannot express this one: a wizard collects a
   * credential BEFORE the account exists, and writing the account first would
   * leave a half-configured row behind on every abandoned or failed attempt.
   *
   * Every branch below returns before anything is written, so a rejected request
   * leaves no trace and the client can safely retry the same payload.
   */
  app.post('/api/accounts/provision', { preHandler: app.requireAuth }, async (req, reply) => {
    const parsed = validateProvision(req.body ?? {});
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    const v = parsed.value;

    const plan = await planForUser(req.user.uid);
    const gate = provisionGate({
      plan,
      kind: v.kind,
      syncedCount: await syncedAccountCount(req.user.uid),
      manualCount: await manualAccountCount(req.user.uid),
    });
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    // Auto Sync: the connector decides whether the credential is usable, and the
    // key must exist before we promise to keep a broker password.
    let credential = null;
    if (v.import_method === 'auto_sync') {
      const connector = getConnector(v.platform);
      if (!connector) return reply.code(400).send({ error: 'Auto Sync is not available for that platform' });
      if (!credentialsEnabled()) {
        return reply.code(503).send({ error: 'Auto Sync is not configured on this server yet' });
      }
      const checked = connector.validateCredential(req.body?.credential ?? {});
      if (!checked.ok) return reply.code(400).send({ error: checked.error });
      credential = checked.value;
    }

    try {
      const { account, replayed } = await provisionAccount(req.user.uid, v, { credential });
      return reply.code(replayed ? 200 : 201).send({ account });
    } catch (err) {
      if (err.conflict === PROVISION_CONFLICT.LOGIN) {
        return reply.code(409).send({ error: err.message, conflict: err.conflict });
      }
      if (err.conflict === PROVISION_CONFLICT.KEY) {
        // Two simultaneous requests carrying the same provision_key: the winner
        // commits, the loser trips this unique violation instead of the
        // in-transaction replay read (that SELECT ran before the winner's row
        // existed), so the loser gets a 409 here rather than the 200 replay. That
        // is correct, not a bug — the loser's own transaction was rolled back, so
        // it has nothing to re-read; a client retry after the 409 lands on the
        // committed row and gets the 200 replay.
        return reply.code(409).send({ error: err.message, conflict: err.conflict });
      }
      throw err;
    }
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
