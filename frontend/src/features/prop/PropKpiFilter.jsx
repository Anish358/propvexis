import React, { useEffect, useRef } from 'react';
import { PROP_KPIS, isPropVisible, isDefaultPropLayout } from './propLayout.js';

// Which business KPIs the Overview shows — a filter, not a layout editor.
//
// The Dashboard gets a full drag-and-drop wireframe (DashLayoutEditor) because
// arranging that page is itself a task. The Overview's headline row is six tiles
// in a fixed order; the only question worth asking is which ones you want to see,
// and a checklist answers that far more directly than a miniature you have to
// drag. Same reason there is no Save button: every tick writes straight through
// to the persisted layout, so the row behind updates as you go.
//
// Anchored to the section's control, not a modal, and closes on outside mousedown
// or Escape — matching BriefSettingsPopover, which is the same kind of surface.

export default function PropKpiFilter({ open, onClose, layout, setPropVisible, resetPropLayout }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggle = setPropVisible || (() => {});
  const shown = PROP_KPIS.filter((k) => isPropVisible(layout, k.id));

  return (
    <div className="bs-pop prop-kpi-filter" ref={ref} role="dialog" aria-label="Choose KPI cards">
      <div className="bs-pop-head">
        <span className="bs-pop-title">KPI cards</span>
        <button type="button" className="bs-pop-x" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="bs-pop-body">
        <div className="bs-group">
          {PROP_KPIS.map((k) => {
            const visible = isPropVisible(layout, k.id);
            // The last visible card can't be unticked — an empty KPI row would
            // collapse the section to a bare gap, which reads as broken rather
            // than as a choice the user made.
            const locked = visible && shown.length === 1;
            return (
              <label key={k.id} className="bs-opt">
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={locked}
                  onChange={(e) => toggle(k.id, e.target.checked)}
                  aria-label={k.label}
                />
                <span className="bs-opt-label">{k.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="bs-pop-foot">
        <button
          type="button"
          className="bs-reset"
          onClick={resetPropLayout}
          disabled={isDefaultPropLayout(layout)}
        >
          Restore defaults
        </button>
      </div>
    </div>
  );
}
