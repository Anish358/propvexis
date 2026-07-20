import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { OUTCOME_OPTIONS, activeFilterCount } from './filters.js';
import { useAuth } from './AuthContext.jsx';
import { NotificationBell } from './Notifications.jsx';

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

// A single multi-select dropdown (checkbox list) that closes on outside click.
function MultiSelect({ label, options, selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
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

// All filters collapse behind one funnel button (Linear-style) — a popover holds
// the category multi-selects + date range, keeping the top bar to a single line.
function FiltersButton({ options, filters, patchFilters, clearFilters, active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const set = (key) => (vals) => patchFilters({ [key]: vals });

  return (
    <div className="tb-filters" ref={ref}>
      <button type="button" className={`tb-btn ${active ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Filters">
        <Icon d={<path d="M3 4h18l-7 8v6l-4 2v-8z" />} />
        <span>Filters</span>
        {active > 0 && <span className="tb-badge">{active}</span>}
      </button>
      {open && (
        <div className="tb-filters-menu">
          <div className="tb-filters-grid">
            <MultiSelect label="Strategy" options={opts(options.setups)} selected={filters.setups} onChange={set('setups')} />
            <MultiSelect label="Pair" options={opts(options.symbols)} selected={filters.symbols} onChange={set('symbols')} />
            <MultiSelect label="Session" options={opts(options.sessions)} selected={filters.sessions} onChange={set('sessions')} />
            <MultiSelect label="Probability" options={opts(options.probability)} selected={filters.probability} onChange={set('probability')} />
            <MultiSelect label="Profit" options={OUTCOME_OPTIONS} selected={filters.outcome} onChange={set('outcome')} />
          </div>
          <div className="tb-filters-dates">
            <input type="date" className="u-input" value={filters.from || ''} max={filters.to || undefined}
              onChange={(e) => patchFilters({ from: e.target.value || null })} title="From date" />
            <span className="tb-date-sep">→</span>
            <input type="date" className="u-input" value={filters.to || ''} min={filters.from || undefined}
              onChange={(e) => patchFilters({ to: e.target.value || null })} title="To date" />
          </div>
          {active > 0 && <button type="button" className="tb-filters-clear" onClick={clearFilters}>Clear all filters</button>}
        </div>
      )}
    </div>
  );
}

// The global top bar. Left: display unit + collapsed filters. Right: a single
// action cluster (notifications, sign-out, account avatar) — the identity that
// used to live at the bottom of the sidebar now lives here, on one line.
export default function FilterBar({ unit, filters, options, setUnit, patchFilters, clearFilters, notifications = [], unread = 0, onMarkAllRead }) {
  const { user, logout } = useAuth();
  const active = activeFilterCount(filters);
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="topbar">
      <div className="tb-left">
        <div className="fb-unit" role="group" aria-label="Display unit">
          <button className={`fb-unit-btn ${unit === 'R' ? 'on' : ''}`} onClick={() => setUnit('R')}>R</button>
          <button className={`fb-unit-btn ${unit === 'USD' ? 'on' : ''}`} onClick={() => setUnit('USD')}>$</button>
        </div>
        <FiltersButton options={options} filters={filters} patchFilters={patchFilters} clearFilters={clearFilters} active={active} />
      </div>

      <div className="tb-right">
        <NotificationBell inline notifications={notifications} unread={unread} onMarkAllRead={onMarkAllRead} />
        <button className="tb-icon" onClick={logout} title="Sign out" aria-label="Sign out">
          <Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>} />
        </button>
        {user && (
          <Link to="/billing" className="tb-avatar-link" title={`${user.name || user.email} · ${(user.plan || 'free').toUpperCase()} — manage plan`}>
            {user.picture
              ? <img className="tb-avatar" src={user.picture} alt={user.name || 'Account'} referrerPolicy="no-referrer" />
              : <span className="tb-avatar tb-avatar-fallback">{initial}</span>}
          </Link>
        )}
      </div>
    </div>
  );
}
