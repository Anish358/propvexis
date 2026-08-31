import React from 'react';
import { Card } from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { StatContext } from '../dashboard/DashWidgets.jsx';
import { fmtMoney } from '../../lib/metrics.js';
import { tradingDaysRead } from './propAccounts.js';

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
  /* TWO THINGS THIS CARD USED TO GET WRONG, both fixed in `tradingDaysRead` so the
     dashboard's footer and the challenge cards cannot answer them differently:
     it printed "7/0" for a firm that asks for no minimum — a denominator of zero
     presented as progress — and "4/3" once the requirement was met, a fraction past its
     own denominator. A requirement is a gate, not a tally.
     The card still earns its place when there is no rule: how many days this account has
     traded is worth knowing either way, so that figure moves into the context line. */
  const days = tradingDaysRead(d);
  return (
    <AcctKpi
      label="Minimum Trading Days"
      explain="Days on which this account traded, against the minimum its challenge requires. Evaluation phases will not pass until the requirement is met, however far ahead the profit target is."
      value={!d ? '—' : days.has ? days.count : 'None required'}
      context={(
        <StatContext
          label={days.has ? 'Requirement' : 'Days traded'}
          value={!d ? '—'
            : !days.has ? String(days.done)
              : days.met ? 'Met' : `${days.required - days.done} to go`}
          tone={days.has && days.met ? 'pos' : ''}
        />
      )}
    />
  );
}
