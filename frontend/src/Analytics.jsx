import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, ReferenceLine, Cell,
} from 'recharts';
import PageHeader from './PageHeader.jsx';
import { fetchStats, fetchYearly } from './api.js';

const rColor = (r) => (r > 0 ? '#6bd58a' : r < 0 ? '#e0918d' : '#9a9aa2');

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone || ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function BreakdownTable({ title, rows = [] }) {
  return (
    <div className="bd">
      <h3>{title}</h3>
      <table>
        <thead><tr><th></th><th># Trades</th><th>SR</th><th>R</th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td>{g.key}</td>
              <td className="num">{g.trades}</td>
              <td className="num">{g.sr == null ? '—' : `${g.sr}%`}</td>
              <td className="num" style={{ color: rColor(g.r) }}>{g.r}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Analytics() {
  const { connected, toggleSidebar, accountId } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [yearly, setYearly] = useState(null);
  const [err, setErr] = useState(null);
  const year = 2026;

  // Refetch when the selected account changes (god view = all owned accounts).
  useEffect(() => {
    fetchStats(accountId).then(setStats).catch((e) => setErr(e.message));
    fetchYearly(year, accountId).then(setYearly).catch((e) => setErr(e.message));
  }, [accountId]);

  const page = (body) => (
    <div className="page">
      <PageHeader title="Analytics" connected={connected} onMenu={toggleSidebar} />
      {body}
    </div>
  );

  if (err) return page(<div className="banner error">Could not load stats: {err}</div>);
  if (!stats) return page(<div className="dash-loading">Loading analytics…</div>);

  const h = stats.headline;

  return page(
    <div className="dashboard">
      {/* KPI row */}
      <div className="kpi-row">
        <Kpi label="Total Return" value={`${h.totalReturn}R`} tone={h.totalReturn >= 0 ? 'win' : 'loss'} />
        <Kpi label="Strike Rate" value={`${h.strikeRate}%`} sub={`${h.wins}W · ${h.losses}L · ${h.breakeven}BE`} />
        <Kpi label="Profit Factor" value={h.profitFactor ?? '—'} />
        <Kpi label="Expectancy" value={`${h.expectancy}R`} sub="per trade" />
        <Kpi label="# Trades" value={h.trades} />
        <Kpi label="Avg Win / Loss" value={`${h.avgWin} / ${h.avgLoss}`} />
        <Kpi label="Win / Loss Streak" value={`${h.winStreak} / ${h.lossStreak}`} />
      </div>

      {/* Equity curve */}
      <div className="panel">
        <h3>Equity Curve (cumulative R)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={stats.equityCurve} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid stroke="#23232a" />
            <XAxis dataKey="i" stroke="#6f6f78" fontSize={11} />
            <YAxis stroke="#6f6f78" fontSize={11} />
            <Tooltip contentStyle={{ background: '#151518', border: '1px solid #2a2a30' }} />
            <ReferenceLine y={0} stroke="#3a3a42" />
            <Line type="monotone" dataKey="cumR" stroke="#6ea8fe" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* R distribution */}
      <div className="panel">
        <h3>R-Outcome Distribution</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.rDistribution} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
            <CartesianGrid stroke="#23232a" vertical={false} />
            <XAxis dataKey="label" stroke="#6f6f78" fontSize={10} />
            <YAxis stroke="#6f6f78" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#151518', border: '1px solid #2a2a30' }} cursor={{ fill: '#ffffff08' }} />
            <Bar dataKey="count">
              {stats.rDistribution.map((b, i) => (
                <Cell key={i} fill={b.label.includes('-') || b.label === 'BE' ? '#7a4a47' : '#3a7a52'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdowns */}
      <div className="bd-grid">
        <BreakdownTable title="By Setup" rows={stats.bySetup} />
        <BreakdownTable title="By Instrument" rows={stats.byInstrument} />
        <BreakdownTable title="By Probability" rows={stats.byProbability} />
        <BreakdownTable title="By Session" rows={stats.bySession} />
        <BreakdownTable title="By Day" rows={stats.byDay} />
        <BreakdownTable title="By Month" rows={stats.byMonth} />
        <BreakdownTable title="By Week" rows={stats.byWeek} />
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
                    <td className="num">{cell(m.overall)}</td>
                    {yearly.setups.map((s) => <td key={s} className="num">{cell(m[s])}</td>)}
                  </tr>
                ))}
                <tr className="total-row">
                  <td>TOTAL</td>
                  <td className="num">{cell(yearly.total.overall)}</td>
                  {yearly.setups.map((s) => <td key={s} className="num">{cell(yearly.total[s])}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function cell(p) {
  if (!p || p.trades === 0) return <span className="muted">—</span>;
  return (
    <span>
      {p.trades} · {p.sr}% · <span style={{ color: rColor(p.r) }}>{p.r}R</span>
    </span>
  );
}
