import React from 'react';
import { BE_THRESHOLD } from '../../lib/metrics.js';
// The column SPEC, not the table: this list only needs each column's id, label and
// default, so it doesn't pull the cell renderers (or React table markup) in.
// settingsColumns() drops the structural ones (row selection) — those aren't a
// show/hide choice.
import { settingsColumns, colVisible } from './tradeColumns.js';

// ---------------------------------------------------------------------------
// Trade Settings — the CONTROLS, with no container of their own.
//
// TWO HOSTS, ONE IMPLEMENTATION. These settings are reachable from two places by
// design: Settings > Trade Settings is where they live, and the Trade Log's toolbar
// (and the top bar's avatar menu) open them in a modal, because adjusting which
// columns you can see is something you want to do while looking at the columns.
//
// So the panel is a component and each host is a frame around it. The alternative —
// a modal and a settings page each rendering their own copy of a breakeven toggle and
// a column checklist — is the shape where one host gains a column the other never
// shows, and the app then disagrees with itself about what a setting is. This is the
// same pattern AccountDetails follows for the Dashboard and Accounts > Details.
//
// IT HOLDS NO STATE, not even a draft. Every control writes straight through to App's
// `tradeSettings`, which is persisted server-side per user, so a change applies while
// the modal is still open and there is no Save button to forget to press. That is why
// the modal's footer says Done rather than Save.
// ---------------------------------------------------------------------------

export default function TradeSettingsPanel({
  beRounding, setBeRounding,
  columnOverrides = {}, setColumnVisible, resetColumns,
}) {
  const cols = settingsColumns();

  return (
    <>
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
    </>
  );
}
