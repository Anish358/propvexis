import React, { useEffect, useRef, useState } from 'react';
import { OUTCOME_OPTIONS, activeFilterCount } from './filters.js';
import { useAuth } from './AuthContext.jsx';
import { NotificationBell } from './Notifications.jsx';
import AccountsModal from './AccountsModal.jsx';
import SettingsModal from './SettingsModal.jsx';

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const GOD = 'all';
const acctLabel = (a) => a.label || `MT5 ${a.mt5_login}`;

// Account selector (top-right): "All accounts (God)" + each BOUND account, plus
// a "Manage accounts" entry. Pending accounts (no trades yet) live in the modal.
// Menu opens downward from the top bar.
function AccountSwitcher({ accounts = [], accountId, setAccountId, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Bound + active only; archived accounts stay out of the switcher (still in the modal).
  const bound = accounts.filter((a) => !a.pending && a.is_active !== false);
  const pendingCount = accounts.filter((a) => a.pending && a.is_active !== false).length;
  const current =
    accountId === GOD
      ? 'All accounts'
      : acctLabel(accounts.find((a) => String(a.mt5_login) === String(accountId)) || {});
  const pick = (id) => { setAccountId(id); setOpen(false); };

  return (
    <div className="acct-switch tb-acct" ref={ref}>
      <button className="acct-switch-btn" onClick={() => setOpen((o) => !o)}>
        <span className="acct-switch-cur">{current || 'Select account'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="acct-menu">
          <button className={`acct-opt ${accountId === GOD ? 'sel' : ''}`} onClick={() => pick(GOD)}>
            ★ All accounts <span className="acct-opt-sub">God view</span>
          </button>
          {bound.map((a) => (
            <button
              key={a.id}
              className={`acct-opt ${String(accountId) === String(a.mt5_login) ? 'sel' : ''}`}
              onClick={() => pick(String(a.mt5_login))}
            >
              {acctLabel(a)} <span className="acct-opt-sub">{a.kind === 'manual' ? 'Manual' : a.mt5_login}</span>
            </button>
          ))}
          <div className="acct-menu-sep" />
          <button className="acct-opt manage" onClick={() => { setOpen(false); onManage(); }}>
            ⚙ Manage accounts{pendingCount ? ` (${pendingCount} pending)` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

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

// The global top bar — everything on one line. Left: display unit + collapsed
// filters. Right: account switcher (scope), notifications, and the account
// avatar (opens the Settings modal). Sign-out moved to the sidebar footer.
export default function FilterBar({
  unit, filters, options, setUnit, patchFilters, clearFilters,
  notifications = [], unread = 0, onMarkAllRead,
  accounts = [], accountId = 'all', setAccountId = () => {}, reloadAccounts = () => {},
  tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
}) {
  const { user } = useAuth();
  const active = activeFilterCount(filters);
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const [manageOpen, setManageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        <AccountSwitcher
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          onManage={() => setManageOpen(true)}
        />
        <NotificationBell inline notifications={notifications} unread={unread} onMarkAllRead={onMarkAllRead} />
        {user && (
          <button
            className="tb-avatar-link"
            onClick={() => setSettingsOpen(true)}
            title={`${user.name || user.email} · ${(user.plan || 'free').toUpperCase()} — settings`}
            aria-label="Settings"
          >
            {user.picture
              ? <img className="tb-avatar" src={user.picture} alt={user.name || 'Account'} referrerPolicy="no-referrer" />
              : <span className="tb-avatar tb-avatar-fallback">{initial}</span>}
          </button>
        )}
      </div>

      {manageOpen && (
        <AccountsModal accounts={accounts} onClose={() => setManageOpen(false)} onChanged={reloadAccounts} />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          unit={unit}
          tradeSettings={tradeSettings}
          setBeRounding={setBeRounding}
          setColumnVisible={setColumnVisible}
          resetColumns={resetColumns}
        />
      )}
    </div>
  );
}
