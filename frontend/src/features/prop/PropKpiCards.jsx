import React from 'react';
import { Card } from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { StatContext } from '../dashboard/DashWidgets.jsx';
import { fmtMoney } from '../../lib/metrics.js';

// The Prop OS Overview's BUSINESS KPI cards.
//
// These are company metrics, not trading metrics — what the operation earned,
// what it costs to run, how much capital is under management. That distinction is
// the whole reason the Overview exists as a separate page, so its headline row
// must not repeat the Dashboard's P&L / win-rate tiles.
//
// GEOMETRY IS BORROWED, NOT REDEFINED. Net P&L in KpiCards.jsx is the locked
// master card: every KPI tile in the app matches its dimensions and typography,
// and the content adapts to fit the container rather than the container growing
// to fit the content. So these render the same `dash-stat dash-stat--typo-match`
// box with `spacing="none"`, and add no sizing of their own. A second geometry
// here would drift from the master the first time either page was tuned.
//
// `k` is the `kpis` object from GET /api/prop/overview (src/propOverview.js).

const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// A business figure with no meaningful sign — funding, account counts, fees paid.
// Tone is reserved for values where up/down genuinely means good/bad, so these
// stay neutral rather than painting every dollar green.
function PropKpi({ label, explain, value, context }) {
  return (
    <Card spacing="none" className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        {label}
        <Explain size={13} nudgeY={-1} openUp>{explain}</Explain>
      </div>
      <div className="jo-kpi-value">{value}</div>
      {context}
    </Card>
  );
}

export function TotalEarnedCard({ k }) {
  return (
    <PropKpi
      label="Total Earned"
      explain="Every payout you have received, after the firm's split — the money this operation has actually paid you."
      value={fmtMoney(k.totalEarned)}
      context={<StatContext label="This month" value={fmtMoney(k.monthlyPayout)} tone={signTone(k.monthlyPayout)} />}
    />
  );
}

export function ActiveAccountsCard({ k }) {
  return (
    <PropKpi
      label="Active Accounts"
      explain="Accounts with live challenge rules that have not breached. A breached account still exists, but it isn't part of the operating business until it's reset."
      value={k.activeAccounts}
    />
  );
}

export function TotalFundingCard({ k }) {
  return (
    <PropKpi
      label="Total Funding"
      explain="Capital you can actually trade: the starting balance of every live funded account. Evaluation accounts are excluded (not yours until you pass), as are breached funded accounts (the firm has stopped you trading them)."
      value={fmtMoney(k.totalFunding)}
    />
  );
}

export function EvalSuccessCard({ k }) {
  const e = k.evalSuccess || {};
  return (
    <PropKpi
      label="Evaluation Success Rate"
      explain="Share of finished evaluation attempts that passed. Funded challenges are excluded — a funded account isn't something you pass."
      // Null (no attempt has finished) reads as a dash, never as 0% — printing a
      // zero would claim a failure record the trader doesn't have.
      value={e.rate == null ? '—' : `${e.rate.toFixed(2)}%`}
      context={(
        <StatContext
          label="Attempts"
          value={e.attempts ? `${e.passed} of ${e.attempts}` : 'None yet'}
          tone=""
        />
      )}
    />
  );
}

export function MonthlyPayoutCard({ k }) {
  return (
    <PropKpi
      label="Monthly Payout"
      explain="Payouts received so far this calendar month, after the split. Resets on the 1st, so it reconciles against the firm's monthly statement."
      value={fmtMoney(k.monthlyPayout)}
    />
  );
}

export function MonthlyFeesCard({ k }) {
  return (
    <PropKpi
      label="Current Monthly Fees"
      explain="Evaluation, reset and activation fees charged this calendar month — what it is costing to run the operation right now."
      value={fmtMoney(k.monthlyFees)}
    />
  );
}
