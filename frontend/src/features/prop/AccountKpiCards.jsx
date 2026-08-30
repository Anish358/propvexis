import React from 'react';
import { Card } from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { StatContext } from '../dashboard/DashWidgets.jsx';
import { fmtMoney } from '../../lib/metrics.js';

// The three ACCOUNT-STATE KPI tiles for Prop OS › Accounts › Details.
//
// They sit in one row beside three trading tiles reused verbatim from
// KpiCards.jsx (Net P&L, Trade Win %, Profit Factor). The split is the point:
// those three describe how the trades went, these three describe where the
// ACCOUNT stands against its challenge — equity, target progress, days served.
// Neither set can answer the other's question, and neither is re-implemented.
//
// GEOMETRY IS BORROWED, NOT REDEFINED, exactly as PropKpiCards.jsx borrows it.
// Net P&L is the locked master card; every tile matches its dimensions and the
// content adapts to the container. So these render the same
// `dash-stat dash-stat--typo-match` box with `spacing="none"` and add no sizing.
//
// `data` is one entry from GET /api/prop — src/domain/prop/prop.js's challengeState.
// Every figure below is read from it, never recomputed here.

function AcctKpi({ label, explain, value, context }) {
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

const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

export function EquityCard({ data }) {
  const profit = data.currentEquity != null && data.startBalance != null
    ? Math.round((data.currentEquity - data.startBalance) * 100) / 100
    : null;
  return (
    <AcctKpi
      label="Equity"
      explain="The account's current equity as the prop engine sees it — live from the EA's balance sync where one exists, otherwise the starting balance plus every closed trade."
      value={fmtMoney(data.currentEquity)}
      context={(
        <StatContext
          label="Since start"
          value={profit == null ? '—' : fmtMoney(profit, { sign: true })}
          tone={signTone(profit)}
        />
      )}
    />
  );
}

export function ProfitTargetCard({ data }) {
  const t = data.profitTarget;
  return (
    <AcctKpi
      label="Profit Target Progress"
      explain="How far this account is through the profit it must make to pass, or to qualify for a payout. Funded accounts carry no target unless you set one."
      // A dash, never 0% — an account with no target has not made zero progress,
      // it has nothing to progress against, and printing 0% would claim otherwise.
      value={t ? `${((t.pctToTarget || 0) * 100).toFixed(1)}%` : '—'}
      context={(
        <StatContext
          label={t ? 'To go' : 'Target'}
          value={t
            ? (t.reached ? 'Target reached' : fmtMoney(Math.max(0, t.target - t.current)))
            : 'Not set'}
          tone={t?.reached ? 'pos' : ''}
        />
      )}
    />
  );
}

export function TradingDaysCard({ data }) {
  const d = data.tradingDays;
  const required = d?.required ?? 0;
  const done = d ? d.completed >= required : false;
  /* NO REQUIREMENT MEANS NO FRACTION. A firm that asks for no minimum made this card
     read "7/0" over "Requirement: None" — a denominator of zero presented as progress,
     under a line saying there is nothing to progress against. The same defect the
     dashboard's account-card footer had, one surface over. The card still earns its
     place: how many days this account has traded is worth knowing whether or not a firm
     is counting them, so that figure moves down into the context line. */
  return (
    <AcctKpi
      label="Minimum Trading Days"
      explain="Days on which this account traded, against the minimum its challenge requires. Evaluation phases will not pass until the requirement is met, however far ahead the profit target is."
      value={!d ? '—' : required === 0 ? 'None required' : `${d.completed}/${required}`}
      context={(
        <StatContext
          label={!d || required === 0 ? 'Days traded' : 'Requirement'}
          value={!d ? '—'
            : required === 0 ? String(d.completed)
              : done ? 'Met' : `${required - d.completed} to go`}
          tone={done && required > 0 ? 'pos' : ''}
        />
      )}
    />
  );
}
