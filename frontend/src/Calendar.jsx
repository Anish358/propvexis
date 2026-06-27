import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import MonthCalendar from './MonthCalendar.jsx';
import MonthSummary from './MonthSummary.jsx';
import DayTradesModal from './DayTradesModal.jsx';
import { computeMetrics, fmtR, weekStart, dayKey } from './metrics.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VIEWS = ['Calendar', 'Monthly', 'Weekly', 'Daily'];

function tone(n) { return n > 0 ? 'win' : n < 0 ? 'loss' : ''; }

// group scored trades by a key fn -> [{ key, label, trades, winRate, r, sortDate }]
function group(trades, keyFn) {
  const m = new Map();
  for (const t of trades) {
    if (t.fixed_r == null) continue;
    const { key, label, sortDate } = keyFn(new Date(t.close_time));
    if (!m.has(key)) m.set(key, { key, label, sortDate, list: [] });
    m.get(key).list.push(t);
  }
  return [...m.values()]
    .map((g) => {
      const wins = g.list.filter((t) => t.fixed_r > 0).length;
      const losses = g.list.filter((t) => t.fixed_r < 0).length;
      const r = g.list.reduce((a, t) => a + Number(t.fixed_r), 0);
      return { ...g, trades: g.list.length, winRate: wins + losses ? Math.round((100 * wins) / (wins + losses)) : 0, r: Math.round(r * 100) / 100 };
    })
    .sort((a, b) => b.sortDate - a.sortDate);
}

function SummaryTable({ rows }) {
  if (!rows.length) return <div className="panel placeholder-panel">No trades yet.</div>;
  return (
    <div className="panel summary-panel">
      <table className="summary-table">
        <thead>
          <tr>
            <th className="t-left">Period</th>
            <th className="t-right">Trades</th>
            <th className="t-right">Win %</th>
            <th className="t-right">R</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td className="t-left">{g.label}</td>
              <td className="t-right">{g.trades}</td>
              <td className="t-right">{g.winRate}%</td>
              <td className={`t-right ${tone(g.r)}`} style={{ fontWeight: 700 }}>{fmtR(g.r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Calendar() {
  const { trades = [], connected, toggleSidebar } = useOutletContext();
  const m = useMemo(() => computeMetrics(trades), [trades]);
  const now = new Date();
  const [view, setView] = useState('Calendar');
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  const dayMap = useMemo(() => {
    const map = new Map();
    for (const d of m.days) map.set(d.key, { pnl: d.pnl, trades: d.trades });
    return map;
  }, [m.days]);

  const byMonth = useMemo(() => group(trades, (d) => ({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, sortDate: new Date(d.getFullYear(), d.getMonth(), 1) })), [trades]);
  const byWeek = useMemo(() => group(trades, (d) => { const s = weekStart(d); const e = new Date(s); e.setDate(s.getDate() + 6); return { key: dayKey(s), label: `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`, sortDate: s }; }), [trades]);
  const byDay = useMemo(() => group(trades, (d) => { const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return { key: dayKey(day), label: `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day.getDay()]}, ${day.getDate()} ${MONTHS[day.getMonth()]} ${day.getFullYear()}`, sortDate: day }; }), [trades]);

  const prevMonth = () => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); };
  const nextMonth = () => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); };

  return (
    <div className="page">
      <PageHeader title="Calendar" connected={connected} onMenu={toggleSidebar} />

      <div className="page-body">
        <div className="view-tabs">
          {VIEWS.map((v) => (
            <button key={v} className={`view-tab ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>
              {v === 'Calendar' ? '📅 ' : ''}{v}
            </button>
          ))}
        </div>

        {view === 'Calendar' && (
          <>
            <div className="cal-layout">
              <div className="panel">
                <MonthCalendar
                  year={calYear} month={calMonth} dayMap={dayMap}
                  onPrev={prevMonth} onNext={nextMonth}
                  onSelectDay={(c) => setSelectedDay(c.key)}
                />
              </div>
              <MonthSummary trades={trades} year={calYear} month={calMonth} />
            </div>
          </>
        )}

        {view === 'Monthly' && <SummaryTable rows={byMonth} />}
        {view === 'Weekly' && <SummaryTable rows={byWeek} />}
        {view === 'Daily' && <SummaryTable rows={byDay} />}
      </div>

      <DayTradesModal dayKeyStr={selectedDay} trades={trades} onClose={() => setSelectedDay(null)} />
    </div>
  );
}
