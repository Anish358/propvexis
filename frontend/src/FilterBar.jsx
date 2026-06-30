import React, { useEffect, useRef, useState } from 'react';
import { OUTCOME_OPTIONS, activeFilterCount } from './filters.js';

// A single multi-select dropdown (checkbox list) that closes on outside click.
// `options` is an array of { value, label }; `selected` is an array of values.
function MultiSelect({ label, options, selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (v) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const count = selected.length;

  return (
    <div className={`fb-ms ${count ? 'active' : ''}`} ref={ref}>
      <button type="button" className="fb-ms-btn" onClick={() => setOpen((o) => !o)}>
        {label}{count ? ` (${count})` : ''}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="fb-ms-menu">
          {options.length === 0 && <div className="fb-ms-empty">No values</div>}
          {options.map((o) => (
            <label key={o.value} className="fb-ms-opt">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
          {count > 0 && <button type="button" className="fb-ms-clear" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}

const opts = (values) => values.map((v) => ({ value: v, label: v }));

// The global filter strip. Renders above every page; edits the active scope's
// ViewConfig via the supplied setters.
export default function FilterBar({ unit, filters, options, setUnit, patchFilters, clearFilters }) {
  const active = activeFilterCount(filters);
  const set = (key) => (vals) => patchFilters({ [key]: vals });

  return (
    <div className="filterbar">
      <div className="fb-unit" role="group" aria-label="Display unit">
        <button className={`fb-unit-btn ${unit === 'R' ? 'on' : ''}`} onClick={() => setUnit('R')}>R</button>
        <button className={`fb-unit-btn ${unit === 'USD' ? 'on' : ''}`} onClick={() => setUnit('USD')}>$</button>
      </div>

      <div className="fb-sep" />

      <MultiSelect label="Strategy" options={opts(options.setups)} selected={filters.setups} onChange={set('setups')} />
      <MultiSelect label="Pair" options={opts(options.symbols)} selected={filters.symbols} onChange={set('symbols')} />
      <MultiSelect label="Session" options={opts(options.sessions)} selected={filters.sessions} onChange={set('sessions')} />
      <MultiSelect label="Probability" options={opts(options.probability)} selected={filters.probability} onChange={set('probability')} />
      <MultiSelect label="Profit" options={OUTCOME_OPTIONS} selected={filters.outcome} onChange={set('outcome')} />

      <div className="fb-dates">
        <input type="date" className="fb-date" value={filters.from || ''} max={filters.to || undefined}
          onChange={(e) => patchFilters({ from: e.target.value || null })} title="From date" />
        <span className="fb-date-sep">→</span>
        <input type="date" className="fb-date" value={filters.to || ''} min={filters.from || undefined}
          onChange={(e) => patchFilters({ to: e.target.value || null })} title="To date" />
      </div>

      {active > 0 && (
        <button className="fb-clear" onClick={clearFilters}>Clear ({active})</button>
      )}
    </div>
  );
}
