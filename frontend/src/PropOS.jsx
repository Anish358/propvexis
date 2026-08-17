import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { LoadingBlock } from '@/components/primitives';
import { fetchPropOverview } from './api.js';
import PropBrief from './PropBrief.jsx';
import PropKpiFilter from './PropKpiFilter.jsx';
import {
  TotalEarnedCard, ActiveAccountsCard, TotalFundingCard,
  EvalSuccessCard, MonthlyPayoutCard, MonthlyFeesCard,
} from './PropKpiCards.jsx';
import MonthCalendar from './MonthCalendar.jsx';
import { FirmsCard, UpcomingPayoutsCard, TransactionsCard, AccountsCard } from './PropCards.jsx';
import {
  defaultPropLayout, visiblePropIds, visiblePropSections,
  propWidgetSpan, PROP_GRID_COLUMNS,
} from './propLayout.js';

// A plain label/value tile for the insight bands below. Not the locked KPI card —
// these sit inside a panel, not in the page's headline row.
function FinKpi({ label, value, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone || ''}`}>{value}</div>
    </div>
  );
}
// Passing & breach insights — pass rates + breach patterns across firm/size/phase.
// Data from GET /api/prop/insights (src/insights.js).
const pct = (v) => (v == null ? '—' : `${v}%`);

function InsightDim({ title, rows }) {
  const shown = rows.filter((r) => r.attempts > 0 || r.active > 0);
  if (shown.length <= 1) return null; // nothing to compare
  return (
    <div className="bd prop-insight-dim">
      <h4>{title}</h4>
      <table>
        <thead><tr><th></th><th>Passed</th><th>Breached</th><th>Active</th><th>Pass rate</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{r.passed}</td>
              <td className="num">{r.breached}</td>
              <td className="num">{r.active}</td>
              <td className="num">{pct(r.passRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// EXPORTED BUT NOT MOUNTED, AS OF THE FINANCE REBUILD (2026-08-17). This band used
// to sit under the old Finance page's totals. Finance's information architecture is
// now locked to three tabs — Summary (KPI cards, ROI Progression, Finance Breakdown),
// Transactions and Funded Accounts — and pass rates are not a money view, so it has
// no place there. It is kept and exported rather than deleted because it works and
// its data endpoint (GET /api/prop/insights) is live: Prop OS › Analytics already
// promises "passing and breach insights" in its own nav blurb, and mounting it there
// is one line plus a fetchPropInsights call when that page is built.
export function InsightsBand({ ins }) {
  if (!ins) return null;
  const hasHistory = ins.attempts > 0;
  return (
    <div className="panel prop-insights">
      <h3>Passing &amp; breach insights</h3>
      {!hasHistory ? (
        <p className="muted prop-insights-empty">
          No completed challenge attempts yet. As you mark phases passed or reset breached
          challenges, pass rates and breach patterns build up here.
        </p>
      ) : (
        <>
          <div className="kpi-row">
            <FinKpi label="Pass rate" value={pct(ins.passRate)} tone={ins.passRate == null ? '' : ins.passRate >= 50 ? 'win' : 'loss'} />
            <FinKpi label="Passed" value={ins.passed} tone="win" />
            <FinKpi label="Breached" value={ins.breached} tone="loss" />
            <FinKpi label="Active" value={ins.active} />
          </div>
          {ins.breachReasons.length > 0 && (
            <div className="prop-insight-reasons">
              <span className="muted">Breaches by reason:</span>
              {ins.breachReasons.map((r) => (
                <span key={r.reason} className="prop-reason-chip">{REASON_LABEL[r.reason] || r.reason} · {r.count}</span>
              ))}
            </div>
          )}
          <div className="bd-grid prop-insight-grid">
            <InsightDim title="By firm" rows={ins.byFirm} />
            <InsightDim title="By account size" rows={ins.bySize} />
            <InsightDim title="By phase" rows={ins.byPhase} />
          </div>
        </>
      )}
    </div>
  );
}
const REASON_LABEL = { max_dd: 'Max drawdown', daily_dd: 'Daily drawdown', unspecified: 'Unspecified' };

// Drawdown status helpers, shared with the Dashboard's account-health card.
//
// These outlived the per-account Overview that used to live here: the Dashboard
// renders the drawdown meters now, and imports both of these to colour them. The
// thresholds stay in one place so the two surfaces can never disagree about what
// counts as "at risk".

// Drawdown headroom → status. Colour is ALWAYS paired with a word + the figures
// (status must never be colour-alone — green/red is the classic CVD confusion).
export function roomStatus(frac, breached) {
  if (breached) return 'bad';
  if (frac == null) return 'na';
  if (frac >= 0.5) return 'good';
  if (frac >= 0.25) return 'warn';
  return 'bad';
}

export function healthStatus(score, breached) {
  if (breached) return 'bad';
  if (score >= 67) return 'good';
  if (score >= 34) return 'warn';
  return 'bad';
}


// ---------------------------------------------------------------------------
// Prop OS › Overview — the BUSINESS view.
//
// This page answers "what is the state of my prop business today?", NOT "how did
// my trades perform?". That is the whole reason it exists as its own surface: a
// trader running eight accounts across three firms is running a small business,
// and its numbers are capital under management, evaluation conversion, fees and
// payouts — none of which the Dashboard's P&L tiles report.
//
// It REPLACED the per-account health gauges and drawdown meters that used to live
// here. Those weren't lost, they were already duplicated: the Dashboard renders
// the same meters on its account card, and rule editing lives in the accounts
// modal. What was genuinely unique to the old page — advancing a challenge phase —
// moves to the Accounts card, where a per-account action belongs.
//
// One fetch drives the whole page (GET /api/prop/overview), and it takes NO
// account id: the business view always spans every account. See the route.
// ---------------------------------------------------------------------------

export default function PropOS() {
  const {
    connected, toggleSidebar, accounts = [],
    propLayout, setPropVisible, resetPropLayout, briefPrefs,
  } = useOutletContext();
  const layout = propLayout || defaultPropLayout();

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  function load() {
    setErr(null);
    fetchPropOverview().then(setData).catch((e) => setErr(e.message));
  }
  // No dependency on the selected account — this page is portfolio-wide, so an
  // account switch must not refetch it.
  useEffect(() => { load(); }, []);

  // One thunk per KPI id, so the row's order is literally the order of the array
  // in `layout` and there is a single place that knows how to build each card.
  const k = data?.kpis;
  const kpiCard = {
    totalEarned: () => <TotalEarnedCard k={k} />,
    activeAccounts: () => <ActiveAccountsCard k={k} />,
    totalFunding: () => <TotalFundingCard k={k} />,
    evalSuccess: () => <EvalSuccessCard k={k} />,
    monthlyPayout: () => <MonthlyPayoutCard k={k} />,
    monthlyFees: () => <MonthlyFeesCard k={k} />,
  };
  const visibleKpis = visiblePropIds(layout, 'kpis');

  // The calendar reads the SAME per-day shape the Dashboard's does, so the
  // component is reused verbatim rather than forked — the only addition is the
  // business-event layer laid over it.
  const dayMap = useMemo(() => {
    const map = new Map();
    for (const d of data?.days ?? []) map.set(d.day, { pnl: d.pnl, trades: d.trades, wins: d.wins, losses: d.losses });
    return map;
  }, [data]);

  const markerMap = useMemo(() => {
    const map = new Map();
    for (const e of data?.calendarEvents ?? []) {
      if (!map.has(e.day)) map.set(e.day, []);
      map.get(e.day).push(e);
    }
    return map;
  }, [data]);

  const gridWidget = {
    firms: () => <FirmsCard firms={data?.firms} />,
    payouts: () => <UpcomingPayoutsCard payouts={data?.payouts} accounts={accounts} onChanged={load} />,
    transactions: () => <TransactionsCard transactions={data?.transactions} />,
    calendar: () => (
      <div className="panel dash-cal-panel card-lg">
        <MonthCalendar
          year={calYear}
          month={calMonth}
          dayMap={dayMap}
          markers={markerMap}
          unit="USD"
          onPrev={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
          onNext={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
          onToday={() => { const n = new Date(); setCalYear(n.getFullYear()); setCalMonth(n.getMonth()); }}
        />
      </div>
    ),
    accounts: () => <AccountsCard accounts={data?.accounts} onChanged={load} />,
  };
  const visibleWidgets = visiblePropIds(layout, 'main');

  const sectionNode = {
    brief: () => <PropBrief brief={data?.brief} briefPrefs={briefPrefs} loading={!data} />,

    // --kpi-count drives the column count, so hiding a card re-splits the row
    // evenly instead of leaving a hole where it used to be — the same lever the
    // Dashboard's KPI row uses, because it is the same locked card geometry.
    kpis: () => (
      <div className="prop-kpis-section">
        <div className="prop-section-head">
          <h3>Business</h3>
          <div className="bs-anchor">
            <button
              type="button"
              className={`dash-banner-settings ${filterOpen ? 'is-open' : ''}`}
              title="Choose KPI cards"
              aria-label="Choose KPI cards"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((o) => !o)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
                <path d="M14 2v4M8 10v4M16 18v4" />
              </svg>
            </button>
            <PropKpiFilter
              open={filterOpen}
              onClose={() => setFilterOpen(false)}
              layout={layout}
              setPropVisible={setPropVisible}
              resetPropLayout={resetPropLayout}
            />
          </div>
        </div>
        <div className="jo-kpis dash-stats" style={{ '--kpi-count': visibleKpis.length }}>
          {visibleKpis.map((id) => <React.Fragment key={id}>{kpiCard[id]()}</React.Fragment>)}
        </div>
      </div>
    ),

    // Placed by CSS Grid's dense auto-flow from each widget's ordinal position +
    // its catalogue size — no coordinates anywhere, same model as the Dashboard.
    main: () => (
      <div className="dash-grid" style={{ '--dash-grid-cols': PROP_GRID_COLUMNS }}>
        {visibleWidgets.map((id) => {
          const { cols, rows } = propWidgetSpan(id);
          return (
            <div
              key={id}
              className="dash-grid-cell"
              style={{ gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}
            >
              {gridWidget[id]()}
            </div>
          );
        })}
      </div>
    ),
  };

  const sections = visiblePropSections(layout);

  return (
    <div className="page">
      <PageHeader title="Prop OS" connected={connected} onMenu={toggleSidebar} />
      <div className="page-body dash-page-body">
        {err ? (
          <div className="banner error">Could not load Prop OS: {err}</div>
        ) : !data ? (
          // The Brief renders its own loading copy, so the page keeps its shape
          // instead of blanking wholesale. Everything below it waits for data:
          // a KPI tile showing $0 would be a claim, not a placeholder.
          <>
            {sections.includes('brief') && sectionNode.brief()}
            <LoadingBlock label="Loading your prop business" />
          </>
        ) : (
          sections.map((id) => <React.Fragment key={id}>{sectionNode[id]()}</React.Fragment>)
        )}
      </div>
    </div>
  );
}
