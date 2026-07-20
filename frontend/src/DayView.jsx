import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { dayKey, valueField, tradeOutcome, fmtVal } from './metrics.js';
import { slug, fmtTime } from './constants.js';
import { Card, Button, EmptyState } from './ui.jsx';

// A single trading day in depth: pick a day, see its stats, every trade, and the
// notes logged against them. Read-only, from the context trades (respects the
// global FilterBar). Day navigation steps between days that actually have trades;
// the date field can jump to any date (showing an empty-day message if none).

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cellClass = { win: 'cell-win', loss: 'cell-loss', be: 'cell-be' };

const Arrow = ({ dir }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === 'prev' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
  </svg>
);

const Stat = ({ label, value, cls }) => (
  <Card>
    <div className="dv-stat-label">{label}</div>
    <div className={`dv-stat-value ${cls || ''}`}>{value}</div>
  </Card>
);

export default function DayView() {
  const { trades = [], unit = 'R', connected, toggleSidebar, tradeSettings = {} } = useOutletContext();
  const beRounding = !!tradeSettings.beRounding;
  const field = valueField(unit);

  // Ascending list of day-keys (YYYY-MM-DD) that have at least one realized trade.
  const dayKeys = useMemo(() => {
    const set = new Set();
    for (const t of trades) if (t[field] != null && t.close_time) set.add(dayKey(new Date(t.close_time)));
    return [...set].sort();
  }, [trades, field]);

  const [selected, setSelected] = useState(null);
  const activeKey = selected ?? dayKeys[dayKeys.length - 1] ?? null;

  const prevKey = useMemo(() => [...dayKeys].reverse().find((k) => k < activeKey), [dayKeys, activeKey]);
  const nextKey = useMemo(() => dayKeys.find((k) => k > activeKey), [dayKeys, activeKey]);

  const list = useMemo(
    () => trades
      .filter((t) => t[field] != null && t.close_time && dayKey(new Date(t.close_time)) === activeKey)
      .sort((a, b) => new Date(a.close_time) - new Date(b.close_time)),
    [trades, field, activeKey],
  );

  const head = <PageHeader title="Day View" connected={connected} onMenu={toggleSidebar} />;

  if (!dayKeys.length) {
    return (
      <div className="page">
        {head}
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>}
          title="No trading days yet"
          description="When trades sync in, pick any day here to review every trade, stat and note from that session."
        />
      </div>
    );
  }

  const d = new Date(`${activeKey}T00:00:00`);
  const title = `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`;
  const net = list.reduce((a, t) => a + Number(t[field]), 0);
  const wins = list.filter((t) => tradeOutcome(t, unit, beRounding) === 'win').length;
  const losses = list.filter((t) => tradeOutcome(t, unit, beRounding) === 'loss').length;
  const decided = wins + losses;
  const winRate = decided ? Math.round((100 * wins) / decided) : 0;
  const vals = list.map((t) => Number(t[field]));
  const best = vals.length ? Math.max(...vals) : 0;
  const notes = list.filter((t) => (t.comments || '').trim());
  const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

  return (
    <div className="page">
      {head}
      <div className="page-body">
        <div className="dv-nav">
          <Button variant="secondary" size="sm" onClick={() => setSelected(prevKey)} disabled={!prevKey} aria-label="Previous trading day"><Arrow dir="prev" /></Button>
          <div className="dv-day">
            <span className="dv-day-title">{title}</span>
            <input
              className="dv-date u-input"
              type="date"
              value={activeKey}
              max={dayKeys[dayKeys.length - 1]}
              onChange={(e) => setSelected(e.target.value || null)}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => setSelected(nextKey)} disabled={!nextKey} aria-label="Next trading day"><Arrow dir="next" /></Button>
        </div>

        {list.length === 0 ? (
          <EmptyState
            title="No trades on this day"
            description="Use the arrows to jump to the nearest day with activity, or pick another date."
            actions={<Button variant="secondary" size="sm" onClick={() => setSelected(dayKeys[dayKeys.length - 1])}>Latest day</Button>}
          />
        ) : (
          <>
            <div className="dv-stats">
              <Stat label="Net" value={fmtVal(net, unit)} cls={sign(net)} />
              <Stat label="Trades" value={list.length} />
              <Stat label="Win rate" value={`${winRate}%`} />
              <Stat label="Best trade" value={fmtVal(best, unit)} cls={sign(best)} />
            </div>

            <Card flush>
              <table className="day-table dv-table">
                <thead><tr><th>Time</th><th>Pair</th><th>Setup</th><th>Session</th><th className="num">{unit === 'USD' ? 'P&L' : 'R'}</th></tr></thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id}>
                      <td>{fmtTime(t.close_time)}</td>
                      <td><span className={`pill pair-${slug(t.symbol_base || t.symbol)}`}>{t.symbol_base || t.symbol}</span></td>
                      <td>{t.setup ? <span className={`pill setup-${slug(t.setup)}`}>{t.setup}</span> : <span className="muted">—</span>}</td>
                      <td>{t.session ? <span className={`pill session-${slug(t.session)}`}>{t.session}</span> : <span className="muted">—</span>}</td>
                      <td className={`num ${cellClass[tradeOutcome(t, unit, beRounding)] || ''}`}>{fmtVal(t[field], unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {notes.length > 0 && (
              <Card>
                <h3 className="dv-notes-title">Notes</h3>
                <div className="dv-notes">
                  {notes.map((t) => (
                    <div className="dv-note" key={t.id}>
                      <div className="dv-note-head">
                        <span className="dv-note-sym">{t.symbol_base || t.symbol}</span>
                        <span className="dv-note-time">{fmtTime(t.close_time)}</span>
                      </div>
                      <p className="dv-note-body">{t.comments}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
