import { resolveScope, listAccounts, ownedLogins, ownedAccountByLogin, propAccountsOnly } from '../domain/accounts/accounts.js';
import { listPayouts } from '../domain/finance/payouts.js';
import { listFees } from '../domain/finance/fees.js';
import { roiProgression, financeSummary } from '../domain/finance/finance.js';
import { passBreachSummary } from '../domain/prop/insights.js';
import { phaseOutcomeAlert, phasePassedAlert } from '../domain/alerts/alerts.js';
import { insertNotifications } from '../domain/alerts/notifications.js';
import { challengeHistory, challengesForScope, lastTradeByLogin, dailyTotalsForLogins, advanceChallenge } from '../domain/prop/challenges.js';
import { applyChallengeOutcome, challengeGroupsForUser, reopenChallenge } from '../domain/prop/challengeGroups.js';
import { businessKpis, firmRollup, upcomingPayouts, recentTransactions, accountsBreakdown, passedChallenges, propCalendarEvents, propBrief } from '../domain/prop/propOverview.js';
import { propStatesForScope } from '../domain/analytics/reports.js';
import { PHASES } from '../domain/accounts/provision.js';

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

  /* THE CHALLENGES THEMSELVES — one row per multi-account challenge (migration 0027),
   * each carrying the accounts that are its phases and what each phase DID.
   *
   * TWO CALLERS, ONE PAYLOAD. The Add Account wizard asks "which challenge is this new
   * account a phase of?" and Prop OS › Challenges asks "how far along is each of my
   * challenges?" — the same question about the same rows, so a second endpoint shaped
   * for one of them would be a second answer that could drift.
   *
   * NO LIVE FIGURES HERE, deliberately. Drawdown room, target progress and health come
   * from GET /api/prop/portfolio, which both callers already load; recomputing them
   * here would let a card and the challenge behind it disagree.
   *
   * AND NO LADDER. Which phase may be added next — p1 -> p2 for a 2-Step, p1 -> funded
   * for a 1-Step — is catalog knowledge, and the catalog lives in frontend/src
   * (propFirms.js `phasesFor`), which the backend cannot import. So this reports the
   * phases that EXIST and what became of each; the client decides what is missing.
   * Same boundary validateProvision draws for the firms' drawdown percentages.
   *
   * Portfolio-wide, ignoring ?account_id, exactly like /api/prop/portfolio and for the
   * same reason: a challenge spans accounts, so scoping it to the selected one would
   * hide the phases either side of it. */
  app.get('/api/prop/challenges', { preHandler: app.requireAuth }, async (req) => ({
    groups: await challengeGroupsForUser(req.user.uid),
  }));

  // Challenge phase history for one owned account (the phase timeline).
  app.get('/api/prop/history', { preHandler: app.requireAuth }, async (req, reply) => {
    const login = Number(req.query.account_id);
    if (Number.isNaN(login)) return reply.code(400).send({ error: 'account_id required' });
    if (!(await ownedAccountByLogin(req.user.uid, login))) return reply.code(404).send({ error: 'account not found' });
    return challengeHistory(req.user.uid, login);
  });

  /* THE MANUAL OVERRIDE (owner decision 2026-08-27): settle THIS phase, or put it back.
   *
   * WHY IT IS NOT /api/prop/advance. That route closes the active challenge AND opens a
   * new one for `to_phase` ON THE SAME ACCOUNT — the pre-0027 model, where a challenge WAS
   * an account. Under the multi-account model that is the wrong write for the common case:
   * the firm issues a NEW LOGIN for the next phase, so marking Phase 1 passed must leave
   * the challenge WAITING for that login rather than inventing a Phase 2 on the Phase 1
   * account, which is what made the wizard's "add the next phase" invitation disappear.
   *
   * ONE WRITER, TWO TRIGGERS. This calls the same `applyChallengeOutcome` the automatic
   * settlement calls, so a phase closed by hand and one closed by the engine are the same
   * row in the same shape, announce themselves through the same dedup key, and cannot
   * drift. The override exists because the engine can be wrong about a real account: a
   * stale EA balance, a payout recorded late, a firm judging a technicality its own way.
   *
   * AND IT WORKS BOTH WAYS. `status: 'active'` reopens the last settled phase, which an
   * automatic system has to allow — without it one bad tick leaves a phase permanently
   * passed and its challenge waiting for a login that will never come.
   *
   * A 409, NOT A 200, when there is nothing to change: the UPDATE is guarded on the row's
   * current status, so a no-op means the phase was already in the state asked for, and
   * saying so is better than an empty success the UI would draw as a change.
   */
  app.post('/api/prop/settle', { preHandler: app.requireAuth }, async (req, reply) => {
    const b = req.body ?? {};
    const login = Number(b.account_id);
    if (Number.isNaN(login)) return reply.code(400).send({ error: 'account_id required' });
    const status = ['passed', 'breached', 'active'].includes(b.status) ? b.status : null;
    if (!status) {
      return reply.code(400).send({ error: 'status must be one of passed, breached, active' });
    }
    // Ownership FIRST and by login, like every other route here: `mt5_account_id` is what
    // the writers take, and resolving it through the owned-account lookup is what stops a
    // body naming someone else's account.
    const acct = await ownedAccountByLogin(req.user.uid, login);
    if (!acct) return reply.code(404).send({ error: 'account not found' });

    const reason = b.reason === 'daily_dd' || b.reason === 'max_dd' ? b.reason : null;
    const settled = status === 'active'
      ? await reopenChallenge(acct.id)
      : await applyChallengeOutcome(acct.id, { status, reason });
    if (!settled) {
      return reply.code(409).send({
        error: status === 'active'
          ? 'This phase is already running'
          : 'This phase has already been settled — reopen it first',
      });
    }

    io.to(`acct:${login}`).emit('prop:updated', { account_id: login });
    // Reopening announces nothing: it undoes a state the trader just saw announced, and a
    // notification saying a phase is running again is noise about their own correction.
    if (status !== 'active') {
      const created = await insertNotifications(req.user.uid, [phaseOutcomeAlert({
        accountId: login,
        label: acct.label,
        phase: settled.phase,
        status: settled.status,
        reason,
        challengeId: settled.challengeId,
      })]);
      for (const n of created) io.to(`user:${req.user.uid}`).emit('notification:new', n);
    }
    return reply.code(201).send(settled);
  });

  // Advance/reset an account's challenge: close the active one (passed|breached) and
  // open a fresh active challenge for `to_phase`, seeded from the account template.
  app.post('/api/prop/advance', { preHandler: app.requireAuth }, async (req, reply) => {
    const b = req.body ?? {};
    const login = Number(b.account_id);
    if (Number.isNaN(login)) return reply.code(400).send({ error: 'account_id required' });
    // PHASES, not a literal: this whitelist and validateProvision's are the same fact,
    // and a 3-Step account that could be CREATED in p3 but not advanced INTO p3 is what
    // two copies of it produce.
    if (!PHASES.includes(b.to_phase)) {
      return reply.code(400).send({ error: `to_phase must be one of ${PHASES.join(', ')}` });
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
