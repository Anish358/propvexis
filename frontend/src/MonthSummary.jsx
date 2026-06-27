import React, { useMemo } from 'react';
import { weekStart, fmtR } from './metrics.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const tone = (n) => (n > 0 ? 'win' : n < 0 ? 'loss' : '');
const r2 = (n) => Math.round(n * 100) / 100;
const sameMonth = (d, y, m) => d.getFullYear() === y && d.getMonth() === m;

function weekLabel(s, e) {
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${MON[s.getMonth()]}`
    : `${s.getDate()} ${MON[s.getMonth()]} – ${e.getDate()} ${MON[e.getMonth()]}`;
}

// Side panel: total R for the displayed month, then each week's R below.
// Driven by year/month so it updates as the user navigates the calendar.
export default function MonthSummary({ trades = [], year, month }) {
  const data = useMemo(() => {
    const scored = trades
      .filter((t) => t.fixed_r != null)
      .map((t) => ({ r: Number(t.fixed_r), d: new Date(t.close_time) }));
    const inMonth = scored.filter((t) => sameMonth(t.d, year, month));

    const monthR = inMonth.reduce((a, t) => a + t.r, 0);
    const wins = inMonth.filter((t) => t.r > 0).length;
    const losses = inMonth.filter((t) => t.r < 0).length;
    const winPct = wins + losses ? Math.round((100 * wins) / (wins + losses)) : 0;

    // every Monday-anchored week that overlaps the month
    const monthEnd = new Date(year, month + 1, 0);
    const weeks = [];
    let cursor = weekStart(new Date(year, month, 1));
    while (cursor <= monthEnd) {
      const wStart = new Date(cursor);
      const wEnd = new Date(cursor); wEnd.setDate(cursor.getDate() + 6);
      const next = new Date(cursor); next.setDate(cursor.getDate() + 7);
      const wTrades = inMonth.filter((t) => t.d >= wStart && t.d < next);
      weeks.push({
        key: wStart.toISOString().slice(0, 10),
        label: weekLabel(wStart, wEnd),
        r: r2(wTrades.reduce((a, t) => a + t.r, 0)),
        trades: wTrades.length,
      });
      cursor = next;
    }
    return { monthR: r2(monthR), winPct, total: inMonth.length, weeks };
  }, [trades, year, month]);

  return (
    <div className="panel month-summary">
      <div className="panel-title">MONTHLY P&L</div>
      <div className="weekly-range">{FULL[month].toUpperCase()} {year}</div>
      <div className={`weekly-pnl ${tone(data.monthR)}`}>{fmtR(data.monthR)}</div>
      <div className="weekly-sub">{data.winPct}% · {data.total}t</div>

      <div className="ms-weeks">
        <div className="ms-weeks-title">BY WEEK</div>
        {data.weeks.map((w) => (
          <div key={w.key} className={`ms-week ${w.trades ? '' : 'ms-empty'}`}>
            <span className="ms-week-label">{w.label}</span>
            <span className="ms-week-meta">
              <span className="ms-week-t">{w.trades}t</span>
              <span className={`ms-week-r ${tone(w.r)}`}>{fmtR(w.r)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
