import React, { useMemo } from 'react';
import { Badge, Card } from '@/components/primitives';
import { fmtMoney } from '../../lib/metrics.js';
import { healthStatus } from './PropOS.jsx';
import { PHASE_LABEL, isBreached } from './propAccounts.js';
import { challengeLifecycle } from './challengesData.js';
import ChallengeKpiCards from './ChallengeKpiCards.jsx';
import ChallengeLifecycle from './ChallengeLifecycle.jsx';

// ---------------------------------------------------------------------------
// Challenges › Details — the single-challenge workspace.
//
// LOCKED SECTION ORDER, and there are exactly three: Selected Challenge Header →
// three stage KPI tiles → one combined lifecycle. No equity curve, no trade table, no
// calendar — those belong to Prop OS › Accounts, which is the ACCOUNT workspace. This
// page is about the challenge's journey to funding, and adding the account's trading
// surfaces here would make the two pages copies of each other with different titles.
//
// THERE IS NO CHALLENGE (OR ACCOUNT) SWITCHER ON THIS PAGE. The app has one universal
// account switcher, in the top bar, and it is the single source of truth for what every
// surface is showing; a challenge IS an account plus its phase history, so selecting a
// challenge card writes to that same selection (see PropChallenges.jsx) rather than to
// a second piece of state this page would then have to reconcile with it.
//
// EVERYTHING IN DOLLARS, regardless of the top bar's R/$ toggle — one challenge, and
// every rule a firm judges it by (drawdown limits, profit target, starting balance) is
// a dollar amount the firm set. The same decision AccountWorkspace.jsx documents.
// ---------------------------------------------------------------------------

const money = (n) => (n == null ? '—' : fmtMoney(n));
const HEALTH_LABEL = { good: 'On Track', warn: 'At Risk', bad: 'Critical', na: 'No Data' };

// ---- Selected Challenge Header --------------------------------------------

function SelectedChallengeHeader({ state, account, current, breached, health }) {
  const size = account?.start_balance != null ? Number(account.start_balance) : state.startBalance;

  return (
    <Card className="pa-header">
      <div className="pa-header-id">
        <div className="pa-header-name-row">
          <h2 className="pa-header-name">{state.label || `Account ${state.account_id}`}</h2>
          <Badge tone={breached ? 'loss' : state.phase === 'funded' ? 'profit' : 'neutral'}>
            {breached ? 'Breached' : state.phase === 'funded' ? 'Funded' : 'Active'}
          </Badge>
        </div>
        <div className="pa-header-sub">
          {account?.firm_name || 'Other'}
          {' · '}
          {current ? `${current.label} of ${current.of}` : PHASE_LABEL[state.phase] || state.phase}
          {' · '}
          {money(size)} account
        </div>
      </div>
      {/* Status is a word plus a dot, never a dot alone — the same rule the Accounts
          workspace and the Dashboard's account tabs follow. */}
      <div className="pa-header-health">
        <span className={`dash-acct-tab-dot dash-acct-tab-dot--${health}`} />
        <span className="pa-header-health-text">
          {HEALTH_LABEL[health]}
          {breached && state.breach?.reason && (
            <span className="pa-header-health-why">
              {state.breach.reason === 'max_dd' ? ' · Max drawdown' : ' · Daily drawdown'}
            </span>
          )}
        </span>
      </div>
    </Card>
  );
}

// ---- the workspace ---------------------------------------------------------

/**
 * `state`   — the engine state for the selected challenge's ACTIVE phase, read out of
 *             the same portfolio payload the cards were built from.
 * `account` — its account record (firm, size, label).
 * `stages`  — this firm's stage list, from the row the card was built from.
 * `history` — GET /api/prop/history's rows, or null while they are still loading. The
 *             lifecycle is drawn either way: without history it still knows where the
 *             challenge stands (from the active phase), and the rows only add the
 *             dates and re-take counts. So the page never blanks waiting on them.
 */
export default function ChallengeDetails({ state, account, stages, history }) {
  const breached = isBreached(state);
  const health = healthStatus(state.health?.score ?? 0, breached);

  const lifecycle = useMemo(
    () => challengeLifecycle({ phase: state.phase, stages, breached, history }),
    [state.phase, stages, breached, history],
  );
  const current = lifecycle.find((s) => s.current) || null;

  return (
    <>
      <SelectedChallengeHeader
        state={state}
        account={account}
        current={current}
        breached={breached}
        health={health}
      />
      <ChallengeKpiCards stages={lifecycle} state={state} activeTone={health} />
      <ChallengeLifecycle stages={lifecycle} state={state} activeTone={health} />
    </>
  );
}
