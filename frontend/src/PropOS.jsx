import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from 'recharts';
import PageHeader from './PageHeader.jsx';
import { LoadingBlock } from '@/components/primitives';
import { fetchPropOverview, fetchPropFinance, fetchPropInsights } from './api.js';
import { fmtMoney, fmtMoneyShort } from './metrics.js';
import { chartPalette } from './theme.js';
import FeesModal from './FeesModal.jsx';
import PropBrief from './PropBrief.jsx';
import PropKpiFilter from './PropKpiFilter.jsx';
import {
  TotalEarnedCard, ActiveAccountsCard, TotalFundingCard,
  EvalSuccessCard, MonthlyPayoutCard, MonthlyFeesCard,
} from './PropKpiCards.jsx';
import { defaultPropLayout, visiblePropIds, visiblePropSections } from './propLayout.js';

// Chart theming from design tokens (matches the rest of the app).

// Cumulative earned / spent / net over time (data from finance.roiProgression).
// Line palette matches the app's equity-curve charts (Analytics/Reports).
function RoiProgressionChart({ series }) {
  if (!series || series.length < 2) return null;
  return (
    <div className="prop-roi">
      <h4 className="prop-roi-title">ROI progression</h4>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={chartPalette().grid} />
          <XAxis dataKey="date" stroke={chartPalette().axis} fontSize={11} tickFormatter={(d) => d.slice(5)} />
          <YAxis stroke={chartPalette().axis} fontSize={11} tickFormatter={(v) => fmtMoneyShort(v)} />
          <Tooltip
            contentStyle={chartPalette().tip}
            formatter={(v, n) => [fmtMoney(v), n]}
            labelStyle={{ color: chartPalette().label }}
          />
          <ReferenceLine y={0} stroke={chartPalette().gridStrong} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="earned" name="Earned" stroke={chartPalette().profit} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="spent" name="Spent" stroke={chartPalette().loss} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="net" name="Net" stroke={chartPalette().accent} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Finance band (Prop OS Overview): spend vs earnings → net + ROI, with a by-firm
// breakdown. Data from GET /api/prop/finance (src/finance.js).
function FinKpi({ label, value, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone || ''}`}>{value}</div>
    </div>
  );
}
const roiText = (r) => (r == null ? '—' : `${r}%`);
const roiTone = (r) => (r == null ? '' : r >= 0 ? 'win' : 'loss');

function FinanceBand({ fin, onLogFee }) {
  if (!fin) return null;
  return (
    <div className="panel prop-finance">
      <div className="prop-finance-head">
        <h3>Finance</h3>
        <button type="button" className="btn" onClick={onLogFee}>Log fee</button>
      </div>
      <div className="kpi-row">
        <FinKpi label="Total spent" value={fmtMoney(fin.spent)} tone="loss" />
        <FinKpi label="Total earned" value={fmtMoney(fin.earned)} tone="win" />
        <FinKpi label="Net" value={fmtMoney(fin.net)} tone={fin.net >= 0 ? 'win' : 'loss'} />
        <FinKpi label="ROI" value={roiText(fin.roiPct)} tone={roiTone(fin.roiPct)} />
      </div>
      {fin.byFirm.length > 1 && (
        <div className="bd prop-finance-firms">
          <table>
            <thead><tr><th>Firm</th><th>Spent</th><th>Earned</th><th>Net</th><th>ROI</th></tr></thead>
            <tbody>
              {fin.byFirm.map((f) => (
                <tr key={f.firmId || 'other'}>
                  <td>{f.firmName}</td>
                  <td className="num">{fmtMoney(f.spent)}</td>
                  <td className="num">{fmtMoney(f.earned)}</td>
                  <td className="num" style={{ color: f.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(f.net)}</td>
                  <td className="num">{roiText(f.roiPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RoiProgressionChart series={fin.progression} />
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

function InsightsBand({ ins }) {
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


// Prop OS › Finance — spend vs earnings → net/ROI + passing & breach insights.
// Split out of the Overview into its own sub-nav page (data from the same
// /api/prop/finance + /api/prop/insights endpoints).
export function PropFinance() {
  const { accountId, connected, toggleSidebar, accounts = [], fees = [], reloadFees } = useOutletContext();
  const [fin, setFin] = useState(null);
  const [ins, setIns] = useState(null);
  const [err, setErr] = useState(null);
  const [feesOpen, setFeesOpen] = useState(false);

  function load() {
    setErr(null);
    fetchPropFinance(accountId).then(setFin).catch((e) => setErr(e.message));
    fetchPropInsights(accountId).then(setIns).catch(() => {});
  }
  useEffect(() => { setFin(null); setIns(null); load(); /* eslint-disable-next-line */ }, [accountId]);

  return (
    <div className="page">
      <PageHeader title="Finance" connected={connected} onMenu={toggleSidebar} />
      {err ? (
        <div className="banner error">Could not load finance: {err}</div>
      ) : !fin ? (
        <LoadingBlock label="Loading finance" />
      ) : (
        <>
          <FinanceBand fin={fin} onLogFee={() => setFeesOpen(true)} />
          <InsightsBand ins={ins} />
        </>
      )}
      {feesOpen && (
        <FeesModal
          fees={fees}
          accounts={accounts}
          defaultLogin={accountId === 'all' ? undefined : accountId}
          onClose={() => setFeesOpen(false)}
          onChanged={() => { reloadFees?.(); load(); }}
        />
      )}
    </div>
  );
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
    connected, toggleSidebar,
    propLayout, setPropVisible, resetPropLayout, briefPrefs,
  } = useOutletContext();
  const layout = propLayout || defaultPropLayout();

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

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
  };

  const sections = visiblePropSections(layout);

  return (
    <div className="page">
      <PageHeader title="Prop OS" connected={connected} onMenu={toggleSidebar} />
      <div className="page-body dash-page-body">
        {err ? (
          <div className="banner error">Could not load Prop OS: {err}</div>
        ) : (
          // The Brief renders its own loading copy, so the page doesn't blank out
          // wholesale while one fetch is in flight. The KPI row waits for data
          // because a tile showing $0 would be a claim, not a placeholder.
          sections.map((id) => (
            <React.Fragment key={id}>
              {id === 'kpis' && !data ? <LoadingBlock label="Loading business KPIs" /> : sectionNode[id]()}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
