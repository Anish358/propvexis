import React, { useMemo } from 'react';
import { dayKey, fmtValShort } from './metrics.js';
import Explain from './Explain.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const round2 = (n) => Math.round(n * 100) / 100;
const tone = (n) => (n > 0 ? 'win' : n < 0 ? 'loss' : '');

// Monthly P&L calendar with a "Week N" summary card aligned to each row. `days`
// is a Map keyed by YYYY-MM-DD -> { pnl, trades, wins, losses }. The day grid and
// week column are ONE 8-column CSS grid (not two side-by-side panels), so each
// week card lines up exactly with its row of days.
export default function MonthCalendar({ year, month, dayMap, onPrev, onNext, onToday, onSelectDay, unit = 'R' }) {
  const { rows, monthTotal, tradingDays } = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = first.getDay(); // leading blanks (Sun-start grid)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    let monthTotal = 0, tradingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = dayKey(new Date(year, month, d));
      const data = dayMap.get(k);
      if (data) { monthTotal += data.pnl; tradingDays += 1; }
      cells.push({ day: d, key: k, data });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      let pnl = 0, days = 0;
      for (const c of week) if (c?.data) { pnl += c.data.pnl; days += 1; }
      rows.push({ week, pnl: round2(pnl), days });
    }
    return { rows, monthTotal: round2(monthTotal), tradingDays };
  }, [year, month, dayMap]);

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="cal-nav">
          <button onClick={onPrev} aria-label="Previous month">‹</button>
          <h3>{MONTHS[month]} {year}</h3>
          <button onClick={onNext} aria-label="Next month">›</button>
        </div>
        {onToday && <button type="button" className="cal-today-btn" onClick={onToday}>This month</button>}
        <div className="cal-head-stats">
          <span className="cal-stats-label">
            Monthly stats
            <Explain align="right">Total P&amp;L and number of trading days in {MONTHS[month]} {year}.</Explain>
          </span>
          <span className={`cal-stats-pill ${tone(monthTotal)}`}>{fmtValShort(monthTotal, unit)}</span>
          <span className="cal-stats-pill days">{tradingDays} day{tradingDays === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="cal-grid-v2">
        {WD.map((d) => <div key={d} className="cal-dow-cell">{d}</div>)}
        <div className="cal-week-head" />

        {rows.map((r, ri) => (
          <React.Fragment key={ri}>
            {r.week.map((c, i) => {
              if (!c) return <div key={`pad-${ri}-${i}`} className="cal-cell cal-empty" />;
              const t = !c.data ? '' : tone(c.data.pnl);
              const winPct = c.data && (c.data.wins + c.data.losses) > 0 ? Math.round((100 * c.data.wins) / (c.data.wins + c.data.losses)) : null;
              return (
                <div
                  key={c.key}
                  className={`cal-cell ${t} ${onSelectDay && c.data ? 'clickable' : ''}`}
                  onClick={() => onSelectDay && c.data && onSelectDay(c)}
                >
                  <div className="cal-daynum">{c.day}</div>
                  {c.data && (
                    <div className="cal-cell-body">
                      <div className="cal-pnl">{fmtValShort(c.data.pnl, unit)}</div>
                      <div className="cal-tcount">{c.data.trades} trade{c.data.trades === 1 ? '' : 's'}</div>
                      {winPct != null && <div className="cal-winpct">{winPct}%</div>}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="cal-week-card">
              <div className="cal-week-label">Week {ri + 1}</div>
              <div className={`cal-week-val ${tone(r.pnl)}`}>{fmtValShort(r.pnl, unit)}</div>
              <span className="cal-week-days">{r.days} day{r.days === 1 ? '' : 's'}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
