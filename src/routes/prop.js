import { resolveScope, listAccounts, ownedLogins, ownedAccountByLogin, propAccountsOnly } from '../domain/accounts/accounts.js';
import { listPayouts } from '../domain/finance/payouts.js';
import { listFees } from '../domain/finance/fees.js';
import { roiProgression, financeSummary } from '../domain/finance/finance.js';
import { passBreachSummary } from '../domain/prop/insights.js';
import { phasePassedAlert } from '../domain/alerts/alerts.js';
import { insertNotifications } from '../domain/alerts/notifications.js';
import { challengeHistory, challengesForScope, lastTradeByLogin, dailyTotalsForLogins, advanceChallenge } from '../domain/prop/challenges.js';
import { businessKpis, firmRollup, upcomingPayouts, recentTransactions, accountsBreakdown, passedChallenges, propCalendarEvents, propBrief } from '../domain/prop/propOverview.js';
import { propStatesForScope } from '../domain/analytics/reports.js';

/**
 * The prop engine's read surface — rule state, challenge finance, the Overview
 * aggregate, passing/breach insights, phase history — plus phase advance.
 *
 * Registered by calling this function on the ROOT app instance rather than through
 * app.register(). A registered plugin gets its own encapsulated context, and a
 * route defined there cannot see decorators or hooks added to the parent
 * afterwards — app.requireAuth would be undefined and the global rate-limit hook
 * would not apply. A plain call keeps every route on the same instance, in the
 * same order, with the same guards it had when these handlers lived in app.js.
 */
export default function propRoutes(app, ctx) {
  const { io } = ctx;

  // ---------------------------------------------------------------------------
  // Prop OS — challenge / drawdown / rule state for the selected account, or a
  // portfolio (one card per account) for the god view. Computed by src/domain/prop/prop.js over
  // the account's active challenge + trades + payouts + EA equity snapshots. All in
  // account currency ($). Scoped like /api/account.
  // ---------------------------------------------------------------------------
  app.get('/api/prop', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    // Shared with the report composition (src/domain/analytics/reports.js) — one bulk-fetch + build.
    return propStatesForScope(scope);
  });

  // Finance summary for the scope: Total spent (fees) vs earned (payouts) → Net,
  // ROI %, plus a by-firm breakdown. Powers the Prop OS Overview finance band.
  app.get('/api/prop/finance', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    const [payouts, fees, accounts] = await Promise.all([
      listPayouts(scope.logins),
      listFees(scope.logins),
      listAccounts(req.user.uid),
    ]);
    // Restrict firm-attribution accounts to the scope's logins. Filtered to prop
    // accounts first: a live account has no firm rules to attribute fees/payouts to.
    const inScope = propAccountsOnly(accounts).filter((a) => scope.logins.includes(a.mt5_login));
    return { ...financeSummary({ payouts, fees, accounts: inScope }), progression: roiProgression({ payouts, fees }) };
  });

  // Prop OS → Overview. The BUSINESS state of the whole prop operation: attention
  // banner, business KPIs, firm rollup, payout schedule, transactions, the accounts
  // breakdown and the calendar's business markers — assembled from one bulk fetch.
  //
  // DELIBERATELY IGNORES ?account_id. Every other route scopes to the selected
  // account; this one always spans every account the user owns, because the
  // questions it answers are portfolio questions. "Active accounts", "total
  // funding" and the accounts ring are meaningless narrowed to one row, and a
  // trader checking their business state should not have to remember to switch the
  // selector to "All" first. Ownership is still enforced — `ownedLogins` bounds
  // everything to this user.
  app.get('/api/prop/overview', { preHandler: app.requireAuth }, async (req) => {
    const logins = await ownedLogins(req.user.uid);
    const scope = { god: true, userId: req.user.uid, logins, filterCol: 'user_id' };
    const asOf = new Date();

    const [propStates, allAccounts, payouts, fees, challenges, lastTrade, days] = await Promise.all([
      propStatesForScope(scope, asOf),
      listAccounts(req.user.uid),
      listPayouts(logins),
      listFees(logins),
      challengesForScope(logins),
      lastTradeByLogin(logins),
      dailyTotalsForLogins(logins),
    ]);
    // Filtered here, at the destructuring, so nothing downstream can see a live
    // account: propOverview.js computes over whatever list it is handed.
    const accounts = propAccountsOnly(allAccounts);
    // propStatesForScope returns { god: true, accounts: [...] } for a god scope, and
    // null when the user owns nothing at all.
    const states = propStates?.accounts ?? [];

    return {
      kpis: businessKpis({ accounts, states, challenges, payouts, fees, asOf }),
      brief: propBrief({ accounts, states, challenges, payouts, lastTradeAt: lastTrade, asOf }),
      firms: firmRollup({ accounts, states }),
      payouts: upcomingPayouts({ accounts, states, payouts, asOf }),
      transactions: recentTransactions({ payouts, fees, accounts }),
      accounts: accountsBreakdown({ accounts, states, challenges, payouts }),
      calendarEvents: propCalendarEvents({ challenges, payouts, accounts }),
      days,
    };
  });

  // Prop OS -> Accounts (Portfolio). The live rule state of EVERY owned account,
  // plus the pass history the "Passed" sub-tab is built from.
  //
  // DELIBERATELY IGNORES ?account_id, for the same reason /api/prop/overview does:
  // the Portfolio is the multi-account view, and narrowing it to the account the
  // top-bar switcher happens to be on would empty three of its four sub-tabs. The
  // Details view is the single-account surface and reads GET /api/prop with the
  // selected account, exactly like every other per-account screen.
  //
  // It returns the engine states RAW rather than a bucketed shape: the four
  // sub-tabs are a presentation split over one predicate each (phase, breached),
  // and every figure a card shows — drawdown room, target progress, trading days —
  // is already on the state. Bucketing here would mean a second, thinner copy of
  // challengeState's output that the cards would then have to be fed from.
  //
  // `accounts` is not returned: the client already holds listAccounts() from
  // GET /api/accounts (it is in the app-wide outlet context), so shipping it again
  // would be a second copy that can go stale against the first.
  app.get('/api/prop/portfolio', { preHandler: app.requireAuth }, async (req) => {
    const logins = await ownedLogins(req.user.uid);
    const scope = { god: true, userId: req.user.uid, logins, filterCol: 'user_id' };

    const [propStates, allAccounts, challenges] = await Promise.all([
      propStatesForScope(scope),
      listAccounts(req.user.uid),
      challengesForScope(logins),
    ]);
    // Filtered here, at the destructuring, so nothing downstream can see a live
    // account.
    const accounts = propAccountsOnly(allAccounts);

    return {
      states: propStates?.accounts ?? [],
      passed: passedChallenges({ challenges, accounts }),
    };
  });

  // Passing & breach insights for the scope: pass rates + breach patterns across
  // firm / account size / phase, from the retained challenge history.
  app.get('/api/prop/insights', { preHandler: app.requireAuth }, async (req, reply) => {
    const scope = await resolveScope(req.user.uid, req.query.account_id);
    if (!scope) return reply.code(403).send({ error: 'account not found' });
    const challenges = await challengesForScope(scope.logins);
    return passBreachSummary(challenges);
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
}
