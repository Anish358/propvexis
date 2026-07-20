import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, ReferenceLine, Cell,
} from 'recharts';
import PageHeader from './PageHeader.jsx';
import { LoadingBlock } from './ui.jsx';
import { fetchStats, fetchYearly } from './api.js';
import { fmtVal, fmtAxis } from './metrics.js';
import { token } from './theme.js';

// Chart theming from design tokens (matches the rest of the app).
const PROFIT = token('--profit');
const LOSS = token('--loss');
const NEUTRAL = token('--text-2');
const GRID = token('--line');
const AXIS = token('--text-3');
const AXIS_STRONG = token('--line-strong');
const ACCENT = token('--accent');
const chartTip = { background: token('--surface-2'), border: `1px solid ${token('--line')}`, borderRadius: 8, color: token('--text') };
const rColor = (r) => (r > 0 ? PROFIT : r < 0 ? LOSS : NEUTRAL);

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone || ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function BreakdownTable({ title, rows = [], unit = 'R' }) {
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

export default function Analytics() {
  const { connected, toggleSidebar, accountId, unit = 'R', filters, tradeSettings = {} } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [yearly, setYearly] = useState(null);
  const [err, setErr] = useState(null);
  const year = new Date().getFullYear();
  const beRound = !!tradeSettings.beRounding;

  // Refetch when the scope, display unit, filters, or precision control changes.
  // These are applied server-side so the aggregates match the rest of the app.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setErr(null);
    fetchStats(accountId, unit, filters, beRound).then(setStats).catch((e) => setErr(e.message));
    fetchYearly(year, accountId, unit, filters, beRound).then(setYearly).catch((e) => setErr(e.message));
  }, [accountId, unit, filterKey, year, beRound]);

  const page = (body) => (
    <div className="page">
      <PageHeader title="Analytics" connected={connected} onMenu={toggleSidebar} />
      {body}
    </div>
  );

  if (err) return page(<div className="banner error">Could not load stats: {err}</div>);
  if (!stats) return page(<LoadingBlock label="Loading analytics" />);

  const h = stats.headline;

  return page(
    <div className="dashboard">
      {/* KPI row */}
      <div className="kpi-row">
        <Kpi label="Total Return" value={fmtVal(h.totalReturn, unit)} tone={h.totalReturn >= 0 ? 'win' : 'loss'} />
        <Kpi label="Strike Rate" value={`${h.strikeRate ?? 0}%`} sub={`${h.wins}W · ${h.losses}L · ${h.breakeven}BE`} />
        <Kpi label="Profit Factor" value={h.profitFactor ?? '—'} />
        <Kpi label="Expectancy" value={fmtVal(h.expectancy, unit)} sub="per trade" />
        <Kpi label="# Trades" value={h.trades} />
        <Kpi label="Avg Win / Loss" value={`${fmtVal(h.avgWin, unit)} / ${fmtVal(h.avgLoss, unit)}`} />
        <Kpi label="Win / Loss Streak" value={`${h.winStreak} / ${h.lossStreak}`} />
      </div>

      {/* Equity curve */}
      <div className="panel">
        <h3>Equity Curve (cumulative {unit === 'USD' ? 'P&L' : 'R'})</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={stats.equityCurve} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis dataKey="i" stroke={AXIS} fontSize={11} />
            <YAxis stroke={AXIS} fontSize={11} tickFormatter={(v) => fmtAxis(v, unit)} />
            <Tooltip contentStyle={chartTip} formatter={(v) => fmtVal(v, unit)} />
            <ReferenceLine y={0} stroke={AXIS_STRONG} />
            <Line type="monotone" dataKey="cumR" stroke={ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* R distribution */}
      <div className="panel">
        <h3>R-Outcome Distribution</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.rDistribution} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
            <YAxis stroke={AXIS} fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={chartTip} cursor={{ fill: '#ffffff08' }} />
            <Bar dataKey="count">
              {stats.rDistribution.map((b, i) => (
                <Cell key={i} fill={b.label.includes('-') || b.label === 'BE' ? LOSS : PROFIT} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdowns */}
      <div className="bd-grid">
        <BreakdownTable title="By Strategy" rows={stats.bySetup} unit={unit} />
        <BreakdownTable title="By Instrument" rows={stats.byInstrument} unit={unit} />
        <BreakdownTable title="By Probability" rows={stats.byProbability} unit={unit} />
        <BreakdownTable title="By Session" rows={stats.bySession} unit={unit} />
        <BreakdownTable title="By Day" rows={stats.byDay} unit={unit} />
        <BreakdownTable title="By Month" rows={stats.byMonth} unit={unit} />
        <BreakdownTable title="By Week" rows={stats.byWeek} unit={unit} />
      </div>

      {/* Yearly: monthly performance by strategy */}
      {yearly && (
        <div className="panel">
          <h3>Yearly Analysis — {yearly.year} (Monthly performance by strategy)</h3>
          <div className="grid-wrap">
            <table className="yearly">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Overall</th>
                  {yearly.setups.map((s) => <th key={s}>{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {yearly.months.filter((m) => m.overall.trades > 0).map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className="num">{cell(m.overall, unit)}</td>
                    {yearly.setups.map((s) => <td key={s} className="num">{cell(m[s], unit)}</td>)}
                  </tr>
                ))}
                <tr className="total-row">
                  <td>TOTAL</td>
                  <td className="num">{cell(yearly.total.overall, unit)}</td>
                  {yearly.setups.map((s) => <td key={s} className="num">{cell(yearly.total[s], unit)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function cell(p, unit = 'R') {
  if (!p || p.trades === 0) return <span className="muted">—</span>;
  return (
    <span>
      {p.trades} · {p.sr}% · <span style={{ color: rColor(p.r) }}>{fmtVal(p.r, unit)}</span>
    </span>
  );
}
