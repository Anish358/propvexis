import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  BarChart, Bar, Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import PageHeader from './PageHeader.jsx';
import MonthCalendar from './MonthCalendar.jsx';
import MonthSummary from './MonthSummary.jsx';
import { GaugeArc, Ring, SplitBar } from './DashWidgets.jsx';
import { computeMetrics, fmtR, fmtRShort } from './metrics.js';

const GREEN = '#39d98a';
const RED = '#e0615b';

function tone(n) { return n > 0 ? 'win' : n < 0 ? 'loss' : ''; }

function Card({ label, badge, children }) {
  return (
    <div className="kcard">
      <div className="kcard-top">
        <span className="kcard-label">{label}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { trades = [], connected, toggleSidebar } = useOutletContext();
  const m = useMemo(() => computeMetrics(trades), [trades]);
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const dayMap = useMemo(() => {
    const map = new Map();
    for (const d of m.days) map.set(d.key, { pnl: d.pnl, trades: d.trades });
    return map;
  }, [m.days]);

  const winShare = m.grossProfit + m.grossLoss > 0 ? m.grossProfit / (m.grossProfit + m.grossLoss) : 1;

  return (
    <div className="page">
      <PageHeader title="Dashboard" connected={connected} onMenu={toggleSidebar} />

      <div className="page-body">
        {/* ---- KPI cards ---- */}
        <div className="kpi-cards">
          <Card label={`NET P&L · ${m.tradeCount}T`}>
            <div className={`kcard-big ${tone(m.net)}`}>{fmtR(m.net)}</div>
            <div className="kcard-foot">
              <span className="win">{fmtRShort(m.grossProfit)}</span>
              <span className={tone(m.expectancy)}>{fmtR(m.expectancy)}/t</span>
              <span className="loss">{fmtRShort(-m.grossLoss)}</span>
            </div>
            <SplitBar winShare={winShare} />
          </Card>

          <Card label="Trade Win %">
            <div className="kcard-split">
              <div>
                <div className={`kcard-big ${tone(1)}`}>{m.winRate.toFixed(1)}%</div>
                <div className="winloss-chips">
                  <span className="chip win">{m.wins}</span>
                  <span className="chip loss">{m.losses}</span>
                </div>
              </div>
              <GaugeArc value={m.winRate / 100} />
            </div>
          </Card>

          <Card label="Profit Factor">
            <div className="kcard-split">
              <div className={`kcard-big ${tone(m.profitFactor - 1)}`}>{m.profitFactor.toFixed(2)}</div>
              <Ring value={Math.min(1, m.profitFactor / 3)} color={GREEN} />
            </div>
          </Card>

          <Card label="Win Streak" badge={<span className="streak-best">⚡ Best: <b>{m.streak.bestWin}W</b><br /><span className="muted">Win streak</span></span>}>
            <div className="kcard-split">
              <div className={`kcard-big ${tone(m.streak.current)}`}>{m.streak.current >= 0 ? '+' : ''}{m.streak.current}</div>
              <Ring value={Math.min(1, Math.abs(m.streak.current) / 5)} color={m.streak.current >= 0 ? GREEN : RED} />
            </div>
          </Card>

          <Card label="Avg Win/Loss">
            <div className={`kcard-big ${tone(1)}`}>{m.avgWinLoss === Infinity ? '∞' : m.avgWinLoss.toFixed(2)}</div>
            <div className="kcard-foot">
              <span className="win">{fmtRShort(m.avgWin)}</span>
              <span className="loss">{fmtRShort(-m.avgLoss)}</span>
            </div>
            <SplitBar winShare={m.avgWin + m.avgLoss > 0 ? m.avgWin / (m.avgWin + m.avgLoss) : 1} />
          </Card>
        </div>

        {/* ---- Thunder score + charts ---- */}
        <div className="dash-mid">
          <div className="panel thunder">
            <div className="panel-title">⚡ THUNDER SCORE</div>
            <ResponsiveContainer width="100%" height={230}>
              <RadarChart data={m.thunderAxes} outerRadius="72%">
                <PolarGrid stroke="#2a2a32" />
                <PolarAngleAxis dataKey="key" tick={{ fill: '#8a8a93', fontSize: 11 }} />
                <Radar dataKey="value" stroke="#7c5cff" fill="#7c5cff" fillOpacity={0.45} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="rr-slider">
              <div className="rr-label">Avg RR</div>
              <div className="rr-track">
                <div className="rr-knob" style={{ left: `${Math.min(100, (m.avgRR / 3) * 100)}%` }} />
              </div>
            </div>
            <div className="thunder-score">{m.thunder}</div>
            <div className="thunder-cap">THUNDER SCORE</div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Cumulative P&L</div>
              <div className="panel-meta">
                <span className={`pct-pill ${tone(m.expectancy)}`}>{fmtR(m.expectancy)}/trade</span>
                <span className={tone(m.net)}>{fmtR(m.net)}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={m.cumulative} margin={{ top: 10, right: 16, bottom: 4, left: -10 }}>
                <CartesianGrid stroke="#1d1d23" vertical={false} />
                <XAxis dataKey="label" stroke="#5a5a63" fontSize={11} tickLine={false} />
                <YAxis stroke="#5a5a63" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}R`} />
                <Tooltip contentStyle={{ background: '#151518', border: '1px solid #2a2a30', borderRadius: 8 }} formatter={(v) => fmtR(v)} />
                <ReferenceLine y={0} stroke="#33333b" />
                <Line type="monotone" dataKey="cum" stroke={GREEN} strokeWidth={2} dot={{ r: 3, fill: GREEN }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Daily P&L</div>
              <div className="panel-meta muted">{m.daily.length}/{m.daily.length}</div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={m.daily} margin={{ top: 10, right: 16, bottom: 4, left: -10 }}>
                <CartesianGrid stroke="#1d1d23" vertical={false} />
                <XAxis dataKey="label" stroke="#5a5a63" fontSize={11} tickLine={false} />
                <YAxis stroke="#5a5a63" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}R`} />
                <Tooltip contentStyle={{ background: '#151518', border: '1px solid #2a2a30', borderRadius: 8 }} cursor={{ fill: '#ffffff08' }} formatter={(v) => fmtR(v)} />
                <ReferenceLine y={0} stroke="#33333b" />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {m.daily.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? GREEN : RED} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ---- Month calendar + weekly ---- */}
        <div className="dash-bottom">
          <div className="panel">
            <MonthCalendar
              year={calYear}
              month={calMonth}
              dayMap={dayMap}
              onPrev={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
              onNext={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
            />
          </div>

          <MonthSummary trades={trades} year={calYear} month={calMonth} />
        </div>
      </div>
    </div>
  );
}
