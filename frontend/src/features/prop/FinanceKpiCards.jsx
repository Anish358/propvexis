import React from 'react';
import { Card } from '@/components/primitives';
import Explain from '../../components/Explain.jsx';
import { StatContext } from '../dashboard/DashWidgets.jsx';
import { fmtMoney } from '../../lib/metrics.js';

// Prop OS › Finance — the KPI tiles, shared by the Summary and Transactions tabs.
//
// ONE CARD SYSTEM, NOT TWO. Net P&L in KpiCards.jsx is the locked master tile:
// every KPI card in the app matches its dimensions and typography, and the content
// adapts to the container rather than the container growing to fit the content. So
// these render the identical `dash-stat dash-stat--typo-match` box with
// `spacing="none"` and add no geometry of their own — the same borrowing
// PropKpiCards.jsx does for the Overview's business row. A second Finance-only
// tile would drift from the master the first time either surface was tuned.
//
// Every tile carries a supporting line, so the four bottom rows align without any
// per-card correction.
//
// Both tabs' rows come from here rather than from their pages, because the
// Transactions row restates three of the Summary's four figures over the FILTERED
// ledger — two copies of "Total Spent" is exactly how the two rows would come to
// disagree about a dollar.

const signTone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const roiText = (r) => (r == null ? '—' : `${r}%`);

function FinKpi({ label, explain, value, tone, context }) {
  return (
    <Card spacing="none" className="dash-stat dash-stat--typo-match">
      <div className="jo-kpi-label">
        {label}
        <Explain size={13} nudgeY={-1} openUp>{explain}</Explain>
      </div>
      <div className={`jo-kpi-value ${tone || ''}`}>{value}</div>
      {context}
    </Card>
  );
}

// ---- Summary row ----------------------------------------------------------
//
// Spend and earnings are NOT painted red and green. Tone is reserved for figures
// where up or down genuinely means better or worse; a fee is a cost of doing
// business, not a loss, and paying more in evaluation fees while earning more is
// a growing operation. Net is the figure whose sign carries a verdict, so it is
// the one that gets colour.

export function TotalSpentCard({ t, evalFees }) {
  return (
    <FinKpi
      label="Total Spent"
      explain="Everything paid to prop firms in the current scope — evaluation fees, resets, activations and anything logged as other. The cost of running the operation."
      value={fmtMoney(t.spent)}
      context={<StatContext label="Evaluation fees" value={fmtMoney(evalFees)} tone="" />}
    />
  );
}

export function TotalEarnedCard({ t }) {
  return (
    <FinKpi
      label="Total Earned"
      explain="Every payout received, after the firm's split — the money this operation has actually paid you."
      value={fmtMoney(t.earned)}
      context={<StatContext label="Payouts" value={`${t.income}`} tone="" />}
    />
  );
}

export function NetTotalCard({ t }) {
  return (
    <FinKpi
      label="Net Total"
      explain="Total earned minus total spent. This is the only figure here whose sign is a verdict, which is why it is the only one coloured."
      value={fmtMoney(t.net, { sign: true })}
      tone={signTone(t.net)}
      context={<StatContext label="ROI" value={roiText(t.roiPct)} tone={t.roiPct == null ? '' : signTone(t.roiPct)} />}
    />
  );
}

export function FundedCapitalCard({ funded }) {
  return (
    <FinKpi
      label="Funded Capital"
      explain="The starting balance of every active funded account in scope — capital you can actually trade. Evaluation accounts are excluded: that capital isn't yours until you pass."
      value={fmtMoney(funded.capital)}
      context={<StatContext label="Funded accounts" value={`${funded.accounts}`} tone="" />}
    />
  );
}

// ---- Transactions row -----------------------------------------------------

export function TotalTransactionsCard({ t }) {
  return (
    <FinKpi
      label="Total Transactions"
      explain="Rows currently in the table below — payouts and fees together. Narrowing the view or the search restates this and the three tiles beside it."
      value={t.count}
      context={<StatContext label="Volume" value={fmtMoney(t.volume)} tone="" />}
    />
  );
}

export function TotalIncomeCard({ t }) {
  return (
    <FinKpi
      label="Total Income"
      explain="Every positive row in view — payouts, after the firm's split."
      value={fmtMoney(t.earned)}
      context={<StatContext label="Payouts" value={`${t.income}`} tone="" />}
    />
  );
}

export function NetCashFlowCard({ t }) {
  return (
    <FinKpi
      label="Net Cash Flow"
      explain="Income minus expenses across the rows in view. Signed and coloured, because its direction is the whole point."
      value={fmtMoney(t.net, { sign: true })}
      tone={signTone(t.net)}
      context={<StatContext label="ROI" value={roiText(t.roiPct)} tone={t.roiPct == null ? '' : signTone(t.roiPct)} />}
    />
  );
}

// Both rows in one place so a page chooses WHICH row it shows, not how a row is
// built — the same contract KpiCards.jsx gives the Dashboard and the Trade Log.
export function FinanceSummaryKpis({ totals, evalFees, funded }) {
  return (
    <div className="jo-kpis dash-stats" style={{ '--kpi-count': 4 }}>
      <TotalSpentCard t={totals} evalFees={evalFees} />
      <TotalEarnedCard t={totals} />
      <NetTotalCard t={totals} />
      <FundedCapitalCard funded={funded} />
    </div>
  );
}

export function FinanceLedgerKpis({ totals, evalFees }) {
  return (
    <div className="jo-kpis dash-stats" style={{ '--kpi-count': 4 }}>
      <TotalTransactionsCard t={totals} />
      <TotalIncomeCard t={totals} />
      <TotalSpentCard t={totals} evalFees={evalFees} />
      <NetCashFlowCard t={totals} />
    </div>
  );
}
