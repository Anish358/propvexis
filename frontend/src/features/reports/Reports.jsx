import React, { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import PageHeader from '../../app/PageHeader.jsx';
import { LoadingBlock } from '@/components/primitives';
import { useAuth } from '../../app/AuthContext.jsx';
import { fetchReport, reportCsvUrl } from '../../lib/api.js';
import { fmtVal, fmtAxis, fmtMoney } from '../../lib/metrics.js';
import { chartPalette } from '../../lib/theme.js';

// Reports (V1) — one shareable artifact composing Journal analytics + Prop OS
// state + payouts for the current scope. Server-composed via GET /api/report
// (src/domain/analytics/reports.js). Pro+ feature; Free sees a locked upgrade prompt. Print
// stylesheet (styles.css @media print) strips the app chrome for Save-as-PDF.

const eaReports = (plan) => plan === 'pro' || plan === 'premium';
const PHASE_LABEL = { p1: 'Phase 1', p2: 'Phase 2', funded: 'Funded' };
// Chart theming from design tokens (matches the rest of the app).
const rColor = (r) => (r > 0 ? chartPalette().profit : r < 0 ? chartPalette().loss : chartPalette().label);

function healthStatus(score, breached) {
  if (breached) return 'bad';
  if (score >= 67) return 'good';
  if (score >= 34) return 'warn';
  return 'bad';
}
const STATUS_WORD = { good: 'Healthy', warn: 'Caution', bad: 'At risk', na: '—' };

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone || ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function Breakdown({ title, rows = [], unit }) {
  if (!rows.length) return null;
  return (
    <div className="bd">
      <h3>{title}</h3>
      <table>
        <thead><tr><th></th><th># Trades</th><th>SR</th><th>{unit === 'USD' ? 'P&L' : 'R'}</th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td>{g.key}</td>
              <td className="num">{g.trades}</td>
              <td className="num">{g.sr == null ? '—' : `${g.sr}%`}</td>
              <td className="num" style={{ color: rColor(g.r) }}>{fmtVal(g.r, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One prop account's status line — health word + drawdown headroom + target.
function PropCard({ a }) {
  const breached = a.breach?.breached;
  const st = healthStatus(a.health?.score ?? 0, breached);
  return (
    <div className={`bd prop-${st}`}>
      <h3>
        {a.label || a.account_id}
        <span className="muted"> · {PHASE_LABEL[a.phase] || a.phase}</span>
        <span className="prop-meter-word" style={{ float: 'right' }}>{STATUS_WORD[st]}</span>
      </h3>
      <table>
        <tbody>
          <tr><td>Equity</td><td className="num">{fmtMoney(a.currentEquity)}</td></tr>
          <tr><td>Health</td><td className="num">{breached ? 0 : a.health?.score ?? '—'}</td></tr>
          {a.maxDd && <tr><td>Max DD room</td><td className="num">{fmtMoney(a.maxDd.roomLeft)}</td></tr>}
          {a.dailyDd && <tr><td>Daily DD room</td><td className="num">{fmtMoney(a.dailyDd.roomLeft)}</td></tr>}
          {a.profitTarget && <tr><td>Profit target</td><td className="num">{a.profitTarget.pctToTarget}% to go</td></tr>}
          {a.tradingDays && <tr><td>Trading days</td><td className="num">{a.tradingDays.completed}/{a.tradingDays.required}</td></tr>}
          {breached && <tr><td>Breach</td><td className="num" style={{ color: 'var(--status-bad)' }}>{a.breach.reason || 'breached'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const { connected, toggleSidebar, accountId, unit = 'R', filters, tradeSettings = {} } = useOutletContext();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [err, setErr] = useState(null);
  const [dlErr, setDlErr] = useState(null);
  const year = new Date().getFullYear();
  const beRound = !!tradeSettings.beRounding;
  const allowed = eaReports(user?.plan);

  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    if (!allowed) return;
    setErr(null); setReport(null);
    fetchReport(accountId, unit, filters, beRound, year).then(setReport).catch((e) => setErr(e.message));
  }, [allowed, accountId, unit, filterKey, year, beRound]);

  const page = (body) => (
    <div className="page report-print">
      <PageHeader title="Reports" connected={connected} onMenu={toggleSidebar} />
      {body}
    </div>
  );

  // Fetch the CSV with credentials, then trigger a client download (the route is
  // auth+scope gated, so we can't just point an <a> at it). Mirrors the EA blob idiom.
  async function downloadCsv() {
    setDlErr(null);
    try {
      const res = await fetch(reportCsvUrl(accountId, unit, filters, beRound, year), { credentials: 'include' });
      if (!res.ok) throw new Error(`export failed (${res.status})`);
      const text = await res.text();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${accountId && accountId !== 'all' ? accountId : 'all'}-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlErr(e.message);
    }
  }

  if (!allowed) {
    return page(
      <div className="panel report-locked">
        <h3>Reports is a Pro feature</h3>
        <p className="muted">
          Generate a shareable performance + prop report — combine your analytics, challenge
          status and payouts into one printable page (Save-as-PDF) or CSV export.
        </p>
        <Link to="/billing" className="btn primary">Upgrade to Pro →</Link>
      </div>
    );
  }

  if (err) return page(<div className="banner error">Could not load report: {err}</div>);
  if (!report) return page(<LoadingBlock label="Building report" />);

  const h = report.stats.headline;
  const p = report.prop;
  const propAccounts = p?.god ? p.accounts : (p && p.phase ? [p] : []);
  const withChallenge = propAccounts.filter((a) => a && a.phase);
  const pay = report.payouts;
  const scopeLabel = report.meta.god ? 'All accounts (god view)' : `Account ${accountId}`;

  return page(
    <div className="dashboard">
      {/* Header + actions (actions hidden in print) */}
      <div className="panel report-header">
        <div>
          <h3>Performance & Prop Report</h3>
          <div className="muted">
            {scopeLabel} · unit {unit} · {year}
            {report.meta.generatedAt && ` · generated ${new Date(report.meta.generatedAt).toLocaleString()}`}
          </div>
        </div>
        <div className="report-actions no-print">
          <button className="btn" onClick={downloadCsv}>Download CSV</button>
          <button className="btn primary" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>
      {dlErr && <div className="banner error no-print">Export failed: {dlErr}</div>}

      {/* Performance summary */}
      <div className="kpi-row">
        <Kpi label="Total Return" value={fmtVal(h.totalReturn, unit)} tone={h.totalReturn >= 0 ? 'win' : 'loss'} />
        <Kpi label="Strike Rate" value={`${h.strikeRate ?? 0}%`} sub={`${h.wins}W · ${h.losses}L · ${h.breakeven}BE`} />
        <Kpi label="Profit Factor" value={h.profitFactor ?? '—'} />
        <Kpi label="Expectancy" value={fmtVal(h.expectancy, unit)} sub="per trade" />
        <Kpi label="# Trades" value={h.trades} />
        <Kpi label="Avg Win / Loss" value={`${fmtVal(h.avgWin, unit)} / ${fmtVal(h.avgLoss, unit)}`} />
      </div>

      <div className="panel">
        <h3>Equity Curve (cumulative {unit === 'USD' ? 'P&L' : 'R'})</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={report.stats.equityCurve} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={chartPalette().grid} />
            <XAxis dataKey="i" stroke={chartPalette().axis} fontSize={11} />
            <YAxis stroke={chartPalette().axis} fontSize={11} tickFormatter={(v) => fmtAxis(v, unit)} />
            <Tooltip contentStyle={chartPalette().tip} formatter={(v) => fmtVal(v, unit)} />
            <ReferenceLine y={0} stroke={chartPalette().gridStrong} />
            <Line type="monotone" dataKey="cumR" stroke={chartPalette().accent} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bd-grid">
        <Breakdown title="By Strategy" rows={report.stats.bySetup} unit={unit} />
        <Breakdown title="By Instrument" rows={report.stats.byInstrument} unit={unit} />
      </div>

      {/* Prop status */}
      {withChallenge.length > 0 && (
        <div className="panel">
          <h3>Prop Status</h3>
          <div className="bd-grid">
            {withChallenge.map((a) => <PropCard key={a.account_id} a={a} />)}
          </div>
        </div>
      )}

      {/* Payouts */}
      <div className="panel">
        <h3>Payouts</h3>
        <div className="kpi-row">
          <Kpi label="Total Gross" value={fmtMoney(pay.grossTotal)} />
          <Kpi label="Trader Net" value={fmtMoney(pay.traderTotal)} tone="win" />
          <Kpi label="# Payouts" value={pay.count} />
        </div>
        {pay.rows.length > 0 && (
          <div className="bd">
            <table>
              <thead><tr><th>Date</th><th>Gross</th><th>Split</th><th>Trader</th><th>Source</th></tr></thead>
              <tbody>
                {pay.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.payout_date}</td>
                    <td className="num">{fmtMoney(r.gross_amount)}</td>
                    <td className="num">{r.split_pct}%</td>
                    <td className="num">{fmtMoney(r.trader_amount)}</td>
                    <td>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
