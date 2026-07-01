import React from 'react';
import { BE_THRESHOLD } from './metrics.js';
import { buildColumns, colVisible } from './TradesTable.jsx';

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
  const cols = buildColumns(unit);

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
