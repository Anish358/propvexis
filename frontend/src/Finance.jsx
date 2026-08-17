import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, EmptyState, Tabs } from '@/components/primitives';
import PageHeader from './PageHeader.jsx';
import FeesModal from './FeesModal.jsx';
import PayoutsModal from './PayoutsModal.jsx';
import { FinanceSummaryKpis, FinanceLedgerKpis } from './FinanceKpiCards.jsx';
import { RoiProgressionCard, FinanceBreakdownCard } from './FinanceSummary.jsx';
import { LedgerCard } from './FinanceLedger.jsx';
import {
  FEE_CATEGORY, accountsInScope, categoryTotal, financeLedger, financeTotals,
  filterLedger, fundedCapital, roiSeries,
} from './financeData.js';

// ---------------------------------------------------------------------------
// Prop OS › Finance — the money view of the prop operation.
//
// THREE TABS, ONE PAGE, ONE LEDGER. Summary answers "where do I stand?",
// Transactions answers "where did each dollar go?", and Funded Accounts is
// deliberately not built yet. All three are one route: the module's IA (nav.js)
// has Finance as a single page, and the app's established way to switch views
// inside a page is the `Tabs` primitive plus local state — the same thing the
// Overview's Accounts card does for its three slices. No route is added, so no
// navigation, no sidebar entry and no deep link changes.
//
// THE PAGE FETCHES NOTHING, and that is the substance of this file. `payouts`,
// `fees` and `accounts` are already in the outlet context — App loads them for the
// whole app, and the first two arrive already narrowed to the selected account
// scope — so Finance derives everything from them through financeData.js instead of
// adding a second loading path over `GET /api/prop/finance`, which returns a subset
// of the same arithmetic. One source, so a KPI tile and a table row can never
// disagree about a dollar, and the global account switcher just works.
//
// WHAT THIS PAGE REPLACED. The previous Finance page was a Finance band (totals +
// a by-firm table + an ROI line chart) plus a "Passing & breach insights" band.
// The locked IA has no place for the insights band, so it is no longer rendered
// here; `InsightsBand` stays exported from PropOS.jsx so nothing is lost and it can
// be mounted on Prop OS › Analytics — whose own nav blurb already promises
// "passing and breach insights" — in one line when that page is built.
// ---------------------------------------------------------------------------

const TABS = [
  { value: 'summary', label: 'Summary' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'funded', label: 'Funded Accounts' },
];

const emptyFilters = () => ({ search: '', categories: [], firms: [] });

export default function Finance() {
  const {
    accountId = 'all', accounts = [], payouts = [], fees = [],
    reloadPayouts, reloadFees, connected, toggleSidebar,
  } = useOutletContext();

  const [tab, setTab] = useState('summary');
  const [view, setView] = useState('all');
  const [filters, setFilters] = useState(emptyFilters);
  const [payoutsOpen, setPayoutsOpen] = useState(false);
  const [feesOpen, setFeesOpen] = useState(false);

  // The whole module's data, derived once. Everything below is a projection.
  const ledger = useMemo(
    () => financeLedger({ payouts, fees, accounts, accountId }),
    [payouts, fees, accounts, accountId],
  );
  const totals = useMemo(() => financeTotals(ledger), [ledger]);
  const evalFees = useMemo(() => categoryTotal(ledger, FEE_CATEGORY.evaluation), [ledger]);
  const funded = useMemo(() => fundedCapital(accounts, accountId), [accounts, accountId]);
  const series = useMemo(() => roiSeries(ledger), [ledger]);

  // The Transactions tab's KPI row describes the rows in the table, filters
  // included — so the narrowing is computed here, above both.
  const rows = useMemo(() => filterLedger(ledger, { view, ...filters }), [ledger, view, filters]);
  const rowTotals = useMemo(() => financeTotals(rows), [rows]);
  const rowEvalFees = useMemo(() => categoryTotal(rows, FEE_CATEGORY.evaluation), [rows]);

  // Which "Add Transaction" options are available at all. A payout belongs to a
  // funded account, so with none in scope the option is disabled rather than opening
  // a form with an empty account picker; a fee applies to any account (an evaluation
  // fee is paid before you are funded), so it only needs one account to exist.
  const scoped = useMemo(() => accountsInScope(accounts, accountId), [accounts, accountId]);
  const fundedAccounts = useMemo(
    () => scoped.filter((a) => a.account_type === 'funded' && a.is_active !== false),
    [scoped],
  );
  const defaultLogin = accountId === 'all' ? undefined : String(accountId).split(',')[0];

  const summary = (
    <>
      <FinanceSummaryKpis totals={totals} evalFees={evalFees} funded={funded} />
      <div className="fin-cols">
        <RoiProgressionCard series={series} totals={totals} />
        <FinanceBreakdownCard ledger={ledger} />
      </div>
    </>
  );

  const transactions = (
    <>
      <FinanceLedgerKpis totals={rowTotals} evalFees={rowEvalFees} />
      <LedgerCard
        ledger={ledger}
        rows={rows}
        view={view}
        onView={setView}
        filters={filters}
        setFilters={setFilters}
        onRecordPayout={() => setPayoutsOpen(true)}
        onLogFee={() => setFeesOpen(true)}
        canRecordPayout={fundedAccounts.length > 0}
        canLogFee={scoped.length > 0}
      />
    </>
  );

  // Intentionally empty, and it has to READ as intentional rather than broken —
  // hence the same "Coming soon" badge + EmptyState treatment every unbuilt route in
  // the app uses (ComingSoon.jsx), and nothing else. No invented tables, cards,
  // charts or filters.
  const fundedTab = (
    <EmptyState
      badge={<Badge tone="brand">Coming soon</Badge>}
      title="Funded Accounts"
      description="The funded side of the operation gets its own view here — payout cycles, capital and per-account earnings. Not built yet."
    />
  );

  return (
    <div className="page">
      <PageHeader title="Finance" connected={connected} onMenu={toggleSidebar} />
      <div className="page-body">
        <Tabs className="fin-tabs" tabs={TABS} value={tab} onChange={setTab} />
        {tab === 'summary' ? summary : tab === 'transactions' ? transactions : fundedTab}
      </div>

      {payoutsOpen && (
        <PayoutsModal
          payouts={payouts}
          fundedAccounts={fundedAccounts}
          defaultLogin={defaultLogin}
          onClose={() => setPayoutsOpen(false)}
          onChanged={() => reloadPayouts?.()}
        />
      )}
      {feesOpen && (
        <FeesModal
          fees={fees}
          accounts={scoped}
          defaultLogin={defaultLogin}
          onClose={() => setFeesOpen(false)}
          onChanged={() => reloadFees?.()}
        />
      )}
    </div>
  );
}
