import React from 'react';
import { BE_THRESHOLD } from './metrics.js';
// The column SPEC, not the table: this list only needs each column's id, label and
// default, so it doesn't pull the cell renderers (or React table markup) in.
import { TRADE_COLUMNS, colVisible } from './tradeColumns.js';

// Trade Settings panel — user-controlled display + analysis options for the
// journal. Two sections today:
//   1. Precision control — breakeven rounding (snaps tiny Fixed R to 0R).
//   2. Trade log columns — which columns are shown in the grid.
// State lives in App (persisted to localStorage) and is threaded via context.
export default function TradeSettingsModal({
  open, onClose, unit = 'R',
  beRounding, setBeRounding,
  columnOverrides = {}, setColumnVisible, resetColumns,
}) {
  if (!open) return null;
  const cols = TRADE_COLUMNS;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ts-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Trade Settings</h2>
          <button className="x" onClick={onClose}>×</button>
        </header>

        {/* Precision control */}
        <section className="ts-section">
          <div className="ts-section-head">
            <h3>Precision control</h3>
          </div>
          <label className="ts-toggle-row">
            <div className="ts-toggle-text">
              <span className="ts-toggle-title">Breakeven rounding</span>
              <span className="ts-toggle-sub">
                Treat any trade with a Fixed R between −{BE_THRESHOLD} and +{BE_THRESHOLD} as a
                breakeven (0R). Applies everywhere — dashboard, calendar, analytics and the trade log.
                <br /><br />
                This holds in the <b>$ view</b> too: such trades are counted as breakeven (not wins or
                losses) in win rate, streaks and profit factor. Their actual dollar P&amp;L is
                <b> kept as-is</b> in balance and totals — a small $ loss is not rounded to $0.
              </span>
            </div>
            <span className={`switch ${beRounding ? 'on' : ''}`} role="switch" aria-checked={beRounding}>
              <input type="checkbox" checked={!!beRounding} onChange={(e) => setBeRounding(e.target.checked)} />
              <span className="switch-knob" />
            </span>
          </label>
        </section>

        {/* Column visibility */}
        <section className="ts-section">
          <div className="ts-section-head">
            <h3>Trade log columns</h3>
            <button type="button" className="ts-reset" onClick={resetColumns}>Reset</button>
          </div>
          <p className="ts-hint">Choose which columns appear in the trade log.</p>
          <div className="ts-cols">
            {cols.map((c) => (
              <label key={c.id} className="ts-col-opt">
                <input
                  type="checkbox"
                  checked={colVisible(columnOverrides, c)}
                  onChange={(e) => setColumnVisible(c.id, e.target.checked)}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </section>

        <footer>
          <span className="footer-spacer" />
          <button className="primary" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}
