import React, { useMemo } from 'react';
import { dayKey, fmtRShort } from './metrics.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Monthly P&L calendar. `days` is a Map keyed by YYYY-MM-DD -> { pnl, trades }.
export default function MonthCalendar({ year, month, dayMap, onPrev, onNext, onSelectDay }) {
  const { cells, summary } = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = first.getDay(); // leading blanks (Sun-start grid)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    let profit = 0, loss = 0, be = 0, trades = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = dayKey(new Date(year, month, d));
      const data = dayMap.get(k);
      if (data) {
        trades += data.trades;
        if (data.pnl > 0) profit++;
        else if (data.pnl < 0) loss++;
        else be++;
      }
      cells.push({ day: d, key: k, data });
    }
    return { cells, summary: { profit, loss, be, trades } };
  }, [year, month, dayMap]);

  return (
    <div className="cal">
      <div className="cal-head">
        <h3>{MONTHS[month]} {year}</h3>
        <div className="cal-nav">
          <button onClick={onPrev} aria-label="Previous month">‹</button>
          <button onClick={onNext} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="cal-summary">
        <div><span className="cs-num win">{summary.profit}</span><span className="cs-lbl">PROFIT</span></div>
        <div><span className="cs-num loss">{summary.loss}</span><span className="cs-lbl">LOSS</span></div>
        <div><span className="cs-num be">{summary.be}</span><span className="cs-lbl">B/E</span></div>
        <div><span className="cs-num">{summary.trades}</span><span className="cs-lbl">TRADES</span></div>
      </div>

      <div className="cal-grid cal-dow">
        {WD.map((d) => <div key={d} className="cal-dow-cell">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((c, i) => {
          if (!c) return <div key={`pad-${i}`} className="cal-cell cal-empty" />;
          const tone = !c.data ? '' : c.data.pnl > 0 ? 'win' : c.data.pnl < 0 ? 'loss' : 'be';
          return (
            <div
              key={c.key}
              className={`cal-cell ${tone} ${onSelectDay && c.data ? 'clickable' : ''}`}
              onClick={() => onSelectDay && c.data && onSelectDay(c)}
            >
              <div className="cal-daynum">{c.day}</div>
              {c.data && (
                <div className="cal-cell-body">
                  <div className="cal-pnl">{fmtRShort(c.data.pnl)}</div>
                  <div className="cal-tcount">{c.data.trades}t</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
