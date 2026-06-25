import React, { useMemo } from 'react';
import { dayKey, weekStart } from './metrics.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKS = 16;

// Magnitude → intensity level (1..3) for color depth.
const level = (absR) => (absR <= 1 ? 1 : absR <= 3 ? 2 : 3);

// GitHub-style contribution grid: last 16 weeks, Mon→Sun rows.
export default function ActivityHeatmap({ dayMap, onSelectDay }) {
  const { columns, monthLabels } = useMemo(() => {
    const today = new Date();
    const thisMonday = weekStart(today);
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - (WEEKS - 1) * 7); // first Monday in the window

    const columns = [];
    const monthLabels = [];
    let lastMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const colStart = new Date(start);
      colStart.setDate(start.getDate() + w * 7);
      // month label when the week's Monday starts a new month
      if (colStart.getMonth() !== lastMonth) {
        monthLabels.push({ w, label: MONTHS[colStart.getMonth()] });
        lastMonth = colStart.getMonth();
      }
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(colStart);
        date.setDate(colStart.getDate() + d);
        const future = date > today;
        const data = dayMap.get(dayKey(date));
        cells.push({ date, key: dayKey(date), data, future });
      }
      columns.push(cells);
    }
    return { columns, monthLabels };
  }, [dayMap]);

  const cellClass = (cell) => {
    if (cell.future) return 'hm-cell hm-future';
    if (!cell.data) return 'hm-cell';
    const r = cell.data.pnl;
    if (r > 0) return `hm-cell hm-win-${level(r)}`;
    if (r < 0) return `hm-cell hm-loss-${level(Math.abs(r))}`;
    return 'hm-cell hm-be';
  };

  return (
    <div className="heatmap">
      <div className="hm-months" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
        {Array.from({ length: WEEKS }).map((_, w) => {
          const m = monthLabels.find((x) => x.w === w);
          return <div key={w} className="hm-month">{m ? m.label : ''}</div>;
        })}
      </div>
      <div className="hm-body">
        <div className="hm-rowlabels">
          {ROWS.map((r) => <div key={r} className="hm-rowlabel">{r}</div>)}
        </div>
        <div className="hm-grid" style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
          {columns.map((col, w) => (
            <div key={w} className="hm-col">
              {col.map((cell) => (
                <div
                  key={cell.key}
                  className={`${cellClass(cell)} ${cell.data && onSelectDay ? 'hm-clickable' : ''}`}
                  title={cell.data ? `${cell.key}: ${cell.data.pnl > 0 ? '+' : ''}${cell.data.pnl}R · ${cell.data.trades}t` : cell.key}
                  onClick={() => cell.data && onSelectDay && onSelectDay(cell)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="hm-legend">
        <span>Less</span>
        <span className="hm-cell" /><span className="hm-cell hm-win-1" /><span className="hm-cell hm-win-2" /><span className="hm-cell hm-win-3" />
        <span>More Profit</span>
        <span className="hm-sep">|</span>
        <span className="hm-cell hm-loss-1" /><span className="hm-cell hm-loss-2" /><span className="hm-cell hm-loss-3" />
        <span>Loss</span>
        <span className="hm-sep">|</span>
        <span className="hm-cell hm-be" /><span>B/E</span>
      </div>
    </div>
  );
}
