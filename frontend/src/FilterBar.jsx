import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { OUTCOME_OPTIONS, activeFilterCount } from './filters.js';
import { navTitle } from './nav.js';
import { useAuth } from './AuthContext.jsx';
import { NotificationBell } from './Notifications.jsx';
import AccountsModal from './AccountsModal.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';

// Light/dark switch — NOT CURRENTLY MOUNTED. The light theme is authored (see
// :root[data-theme="light"] in styles.css) and its contrast is verified, but it
// hasn't been visually reviewed and the UI is still changing fast, so exposing it
// would ship a half-finished look. Kept intact rather than deleted: re-enabling is
// putting <ThemeToggle theme={theme} setTheme={setTheme} /> back next to
// <NotificationBell> below. Shows the theme you'd GET by clicking — a sun while
// you're in dark — which reads faster than showing the state you're already in.
function ThemeToggle({ theme, setTheme }) {
  const toLight = theme !== 'light';
  return (
    <button
      type="button"
      className="tb-icon-btn"
      onClick={() => setTheme(toLight ? 'light' : 'dark')}
      title={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {toLight ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const GOD = 'all';
const acctLabel = (a) => a.label || `MT5 ${a.mt5_login}`;

// Account selector (top-right): "All accounts (God)" + each BOUND account as a
// multi-select checkbox, plus a "Manage accounts" entry. The selection is 'all'
// (god) or a comma-joined list of mt5 logins; picking two or more accounts gives
// an aggregate (R-based) view restricted to them. Pending accounts live in the
// modal. Menu opens downward from the top bar; checkboxes keep it open.
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

  const selected = accountId === GOD ? [] : String(accountId).split(',');
  const isSel = (login) => selected.includes(String(login));
  const toggle = (login) => {
    const key = String(login);
    const next = isSel(key) ? selected.filter((l) => l !== key) : [...selected, key];
    const sorted = next.map(Number).sort((a, b) => a - b).map(String);
    setAccountId(sorted.length ? sorted.join(',') : GOD);
  };

  let current;
  if (accountId === GOD) current = 'All accounts';
  else if (selected.length === 1) current = acctLabel(bound.find((a) => String(a.mt5_login) === selected[0]) || {});
  else current = `${selected.length} accounts`;

  return (
    <div className="acct-switch tb-acct" ref={ref}>
      <button className="acct-switch-btn" onClick={() => setOpen((o) => !o)}>
        <span className="acct-switch-cur">{current || 'Select account'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="acct-menu">
          <button className={`acct-opt ${accountId === GOD ? 'sel' : ''}`} onClick={() => { setAccountId(GOD); setOpen(false); }}>
            ★ All accounts <span className="acct-opt-sub">God view</span>
          </button>
          {bound.map((a) => (
            <label key={a.id} className={`acct-opt acct-opt-check ${isSel(a.mt5_login) ? 'sel' : ''}`}>
              <input type="checkbox" checked={isSel(a.mt5_login)} onChange={() => toggle(a.mt5_login)} />
              <span className="acct-opt-name">{acctLabel(a)}</span>
              <span className="acct-opt-sub">{a.kind === 'manual' ? 'Manual' : a.mt5_login}</span>
            </label>
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

// The avatar opens a DROPDOWN (not a modal) with the user's identity + settings
// shortcuts. "Trade settings" still opens its own modal (column visibility etc.).
function UserMenu({ unit, tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const plan = (user.plan || 'free').toUpperCase();
  const avatar = user.picture
    ? <img className="tb-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
    : <span className="tb-avatar tb-avatar-fallback">{initial}</span>;

  return (
    <div className="tb-user" ref={ref}>
      <button className="tb-avatar-link" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Account" aria-label="Account">
        {avatar}
      </button>
      {open && (
        <div className="tb-user-menu" role="menu">
          <div className="tb-user-head">
            {avatar}
            <div className="tb-user-id">
              <span className="tb-user-name">{user.name || 'Account'}</span>
              <span className="tb-user-email">{user.email}</span>
            </div>
          </div>
          <div className="tb-user-plan">
            <span className="muted">Plan</span>
            <span className={`sb-plan-badge ${user.plan || 'free'}`}>{plan}</span>
          </div>
          <div className="tb-menu-sep" />
          <button className="tb-menu-item" role="menuitem" onClick={() => { setOpen(false); setPrefsOpen(true); }}>Trade settings</button>
          <Link className="tb-menu-item" role="menuitem" to="/settings" onClick={() => setOpen(false)}>Settings</Link>
          <Link className="tb-menu-item" role="menuitem" to="/billing" onClick={() => setOpen(false)}>Manage plan</Link>
          <div className="tb-menu-sep" />
          <button className="tb-menu-item danger" role="menuitem" onClick={logout}>Sign out</button>
        </div>
      )}
      <TradeSettingsModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        unit={unit}
        beRounding={!!tradeSettings.beRounding}
        setBeRounding={setBeRounding}
        columnOverrides={tradeSettings.columns || {}}
        setColumnVisible={setColumnVisible}
        resetColumns={resetColumns}
      />
    </div>
  );
}

// The single global bar. Left: only the sidebar re-opener, when the sidebar is
// collapsed. Middle→right: per-page actions portaled in from PageHeader
// (slotRef). Right: the view controls (unit + filters) followed by the always-on
// controls — account scope switcher, notifications, account avatar. Page content
// starts directly below this bar (pages no longer render their own header row).
export default function FilterBar({
  unit, filters, options, setUnit, patchFilters, clearFilters,
  notifications = [], unread = 0, onMarkAllRead,
  accounts = [], accountId = 'all', setAccountId = () => {}, reloadAccounts = () => {},
  tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
  collapsed = false, onToggleSidebar = () => {}, slotRef,
  theme = 'dark', setTheme = () => {},
}) {
  const active = activeFilterCount(filters);
  const [manageOpen, setManageOpen] = useState(false);
  // Which page you're on, resolved from the same NAV config the sidebar renders
  // — so the two can't disagree. null on an unrecognized path; render nothing
  // rather than guess a name.
  const title = navTitle(useLocation().pathname);

  return (
    <div className="topbar">
      {/* The view controls moved across to the right; the left now holds the
          sidebar re-opener and the current page's name. */}
      <div className="tb-left">
        {collapsed && (
          <button className="tb-menu" onClick={onToggleSidebar} title="Show sidebar" aria-label="Show sidebar">
            <span /><span /><span />
          </button>
        )}
        {title && (
          <h1 className="tb-title">
            {title.module && <span className="tb-title-module">{title.module}</span>}
            <span className="tb-title-page">{title.page}</span>
          </h1>
        )}
      </div>

      {/* Per-page actions portal here (PageHeader → this node). */}
      <div className="tb-page" ref={slotRef} />

      <div className="tb-right">
        <div className="fb-unit" role="group" aria-label="Display unit">
          <button className={`fb-unit-btn ${unit === 'R' ? 'on' : ''}`} onClick={() => setUnit('R')}>R</button>
          <button className={`fb-unit-btn ${unit === 'USD' ? 'on' : ''}`} onClick={() => setUnit('USD')}>$</button>
        </div>
        <FiltersButton options={options} filters={filters} patchFilters={patchFilters} clearFilters={clearFilters} active={active} />
        <AccountSwitcher
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          onManage={() => setManageOpen(true)}
        />
        {/* <ThemeToggle theme={theme} setTheme={setTheme} /> — parked, see above */}
        <NotificationBell inline notifications={notifications} unread={unread} onMarkAllRead={onMarkAllRead} />
        <UserMenu
          unit={unit}
          tradeSettings={tradeSettings}
          setBeRounding={setBeRounding}
          setColumnVisible={setColumnVisible}
          resetColumns={resetColumns}
        />
      </div>

      {manageOpen && (
        <AccountsModal accounts={accounts} onClose={() => setManageOpen(false)} onChanged={reloadAccounts} />
      )}
    </div>
  );
}
