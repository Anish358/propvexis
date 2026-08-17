import React, { useMemo, useState } from 'react';
import { fmtVal, tradeOutcome, valueField } from '../../lib/metrics.js';
import { slug, fmtTime } from '../../lib/constants.js';
import { fmtMins, holdMinutes, dayTitle, dayRelative } from './dayStats.js';

// One trading day, as a card. This is the unit the Daily Journal is built from —
// a day you review, not a row you scan.
//
// Header: the DATE is the title (a journal entry is a date), with the day's result,
// its trade count, and the actions. No date stepper — the page is a feed of days,
// so stepping through one at a time is what the feed already does.
//
// Body: the day's shape at a glance — a cumulative curve plus the eight figures
// that answer "how did this session go". Always visible, because that's the review.
//
// Trades: behind a disclosure. Collapsed, a day is a summary you skim; expanded,
// it's the detail. Every card starting expanded would bury the second day below
// the fold.

const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const cellClass = { win: 'cell-win', loss: 'cell-loss', be: 'cell-be' };

const Chevron = ({ open }) => (
  <svg className={`dc-chev ${open ? 'is-open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

// Cumulative P&L as an inline SVG area — no chart library for a card that repeats
// once per day, and it needs no axes to read: the shape and the end point are the
// message. Drawn in a 0..100 viewBox and stretched, so it fits any card width.
export function DayCurve({ curve = [], tone = 'pos' }) {
  const pts = curve.filter((p) => Number.isFinite(p.cum));
  if (pts.length < 2) return <div className="dc-curve dc-curve--empty">Not enough trades to plot</div>;

  const vals = pts.map((p) => p.cum);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  // A flat day would divide by zero; give it a nominal range so the line sits
  // mid-height instead of collapsing onto an edge.
  const span = max - min || 1;
  const x = (i) => (i / (pts.length - 1)) * 100;
  const y = (v) => 100 - ((v - min) / span) * 100;

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.cum).toFixed(2)}`).join(' ');
  const area = `${line} L100,${y(min).toFixed(2)} L0,${y(min).toFixed(2)} Z`;
  const zero = y(0).toFixed(2);

  return (
    <svg className={`dc-curve tone-${tone}`} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Cumulative profit and loss through the day">
      {/* Breakeven line, so a curve that ends up is visibly ABOVE flat rather than
          just somewhere in the box. */}
      <line className="dc-curve-zero" x1="0" y1={zero} x2="100" y2={zero} vectorEffect="non-scaling-stroke" />
      <path className="dc-curve-fill" d={area} />
      <path className="dc-curve-line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const Tile = ({ label, value, tone }) => (
  <div className="dc-tile">
    <span className="dc-tile-label">{label}</span>
    <span className={`dc-tile-value ${tone || ''}`}>{value}</span>
  </div>
);

export default function DayCard({
  day, unit = 'R', beRounding = false, open = false, onToggle = () => {},
  onJournal = () => {}, onTradeClick = () => {},
}) {
  const { key, trades, stats } = day;
  const field = valueField(unit);
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    if (filter === 'all') return trades;
    const want = filter === 'winners' ? 'win' : 'loss';
    return trades.filter((t) => tradeOutcome(t, unit, beRounding) === want);
  }, [trades, filter, unit, beRounding]);

  const relative = dayRelative(key);
  const netTone = sign(stats.net);

  return (
    <section className={`dc ${open ? 'is-open' : ''}`} aria-label={dayTitle(key)}>
      <header className="dc-head">
        <div className="dc-title-group">
          <h3 className="dc-title">{dayTitle(key)}</h3>
          {relative && <span className="dc-relative">{relative}</span>}
        </div>

        <div className="dc-head-actions">
          <span className={`dc-net ${netTone}`}>{fmtVal(stats.net, unit)}</span>
          <span className="dc-count">{stats.trades} trade{stats.trades === 1 ? '' : 's'}</span>
          {/* Opens the day's Journal workspace — the journalling half of the page
              (see DayJournalWorkspace). */}
          <button type="button" className="dc-journal" onClick={() => onJournal(day)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Journal
            {stats.notes > 0 && <span className="dc-journal-count">{stats.notes}</span>}
          </button>
          <button
            type="button"
            className="dc-disclose"
            onClick={() => onToggle(key)}
            aria-expanded={open}
            aria-label={open ? 'Hide trades' : 'Show trades'}
            title={open ? 'Hide trades' : 'Show trades'}
          >
            <Chevron open={open} />
          </button>
        </div>
      </header>

      <div className="dc-body">
        <div className="dc-curve-wrap">
          <div className="dc-curve-head">
            <span className="dc-curve-label">Cumulative P&L</span>
            <span className={`dc-curve-val ${netTone}`}>{fmtVal(stats.net, unit)}</span>
          </div>
          <DayCurve curve={stats.curve} tone={netTone || 'pos'} />
        </div>

        <div className="dc-tiles">
          <Tile label="Gross P&L" value={fmtVal(stats.net, unit)} tone={netTone} />
          <Tile label="Winners" value={stats.winners} tone={stats.winners ? 'pos' : ''} />
          <Tile label="Losers" value={stats.losers} tone={stats.losers ? 'neg' : ''} />
          <Tile label="Win rate" value={stats.winRate == null ? '—' : `${stats.winRate}%`} />
          <Tile label="Total lots" value={stats.lots || '—'} />
          <Tile label="Avg duration" value={fmtMins(stats.avgDuration)} />
          <Tile label="Best trade" value={stats.best == null ? '—' : fmtVal(stats.best, unit)} tone={sign(stats.best)} />
          <Tile label="Worst trade" value={stats.worst == null ? '—' : fmtVal(stats.worst, unit)} tone={sign(stats.worst)} />
        </div>
      </div>

      {open && (
        <div className="dc-trades">
          <div className="dc-trades-bar">
            <div className="dc-seg" role="group" aria-label="Filter trades">
              {[['all', 'All'], ['winners', 'Winners'], ['losers', 'Losers']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`dc-seg-btn ${filter === id ? 'on' : ''}`}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="dc-trades-count">{rows.length} of {trades.length}</span>
          </div>

          {rows.length === 0 ? (
            <p className="dc-trades-empty">No {filter} on this day.</p>
          ) : (
            <table className="day-table dc-table">
              <thead>
                <tr>
                  <th>Time</th><th>Symbol</th><th>Side</th><th>Lots</th>
                  <th>Entry</th><th>Exit</th><th>Duration</th>
                  <th>{unit === 'USD' ? 'Net P&L' : 'R'}</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} onClick={() => onTradeClick(t)} title="Open this trade">
                    <td>{fmtTime(t.close_time)}</td>
                    <td><span className={`pill pair-${slug(t.symbol_base || t.symbol)}`}>{t.symbol_base || t.symbol}</span></td>
                    <td>{t.direction ? <span className={`pill dir-${slug(t.direction)}`}>{t.direction === 'sell' ? 'Sell' : 'Buy'}</span> : <span className="muted">—</span>}</td>
                    <td>{t.volume == null ? <span className="muted">—</span> : t.volume}</td>
                    <td>{t.entry_price ?? <span className="muted">—</span>}</td>
                    <td>{t.exit_price ?? <span className="muted">—</span>}</td>
                    <td>{fmtMins(holdMinutes(t))}</td>
                    <td className={cellClass[tradeOutcome(t, unit, beRounding)] || ''}>{fmtVal(t[field], unit)}</td>
                    <td className="dc-note-cell">
                      {(t.comments || '').trim()
                        ? <span className="dc-note-mark" title={t.comments}>Note</span>
                        : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
