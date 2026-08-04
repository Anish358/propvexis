import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { activeFilterCount } from './filters.js';
import { navTitle } from './nav.js';
import { titleCase } from './constants.js';
import FilterPanel from './FilterPanel.jsx';
// PHASE 4b — the top bar's overlays run on Base UI now. These primitives carry
// behaviour and positioning only; every surface below keeps its own legacy classes,
// so the bar looks identical and only its keyboard, focus and ARIA change. See
// components/primitives/menu.jsx for why they are not the skinned generated ones.
import {
  Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuGroupLabel, MenuItem,
  MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger,
} from '@/components/primitives';
import { useAuth } from './AuthContext.jsx';
import { NotificationBell } from './Notifications.jsx';
import AccountsModal from './AccountsModal.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';

// Light/dark switch. Shows the theme you'd GET by clicking — a sun while you're in
// dark — which reads faster than showing the state you're already in.
//
// The light theme it toggles is KNOWINGLY UNFINISHED: contrast is verified but the
// palette hasn't been tuned, and it currently reads flat (white sidebar against a
// near-white page, cards barely separated from it). Mounted deliberately anyway so
// it can be improved in place. Dark is unaffected either way — dark is :root, and
// the toggle only adds data-theme="light" to <html>.
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
//
// PHASE 4b — on Base UI. The account rows were `<label><input type="checkbox">`, which
// looked right and announced wrong: form controls inside a role-less div, with nothing
// saying this was a menu or that the rows were multi-select. They are
// `MenuCheckboxItem` now — role="menuitemcheckbox" with aria-checked — and "checkboxes
// keep it open", which the old version achieved by having no dismissal logic at all,
// is `closeOnClick={false}` said out loud in the primitive.
//
// The native <input> stays as the tick mark only: Base UI owns the state, the toggle
// and the semantics, so the input is aria-hidden and taken out of the tab order rather
// than sitting there as a second, competing control on the same row.
function AccountSwitcher({ accounts = [], accountId, setAccountId, onManage }) {
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
    <div className="acct-switch tb-acct">
      <Menu>
        <MenuTrigger className="acct-switch-btn">
          <span className="acct-switch-cur">{current || 'Select account'}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
        </MenuTrigger>
        <MenuContent className="acct-menu">
          <MenuItem className={`acct-opt ${accountId === GOD ? 'sel' : ''}`} onClick={() => setAccountId(GOD)}>
            ★ All accounts <span className="acct-opt-sub">God view</span>
          </MenuItem>
          {bound.map((a) => (
            <MenuCheckboxItem
              key={a.id}
              className={`acct-opt acct-opt-check ${isSel(a.mt5_login) ? 'sel' : ''}`}
              checked={isSel(a.mt5_login)}
              onCheckedChange={() => toggle(a.mt5_login)}
            >
              <input type="checkbox" checked={isSel(a.mt5_login)} readOnly tabIndex={-1} aria-hidden="true" />
              <span className="acct-opt-name">{acctLabel(a)}</span>
              <span className="acct-opt-sub">{a.kind === 'manual' ? 'Manual' : a.mt5_login}</span>
            </MenuCheckboxItem>
          ))}
          <MenuSeparator className="acct-menu-sep" />
          <MenuItem className="acct-opt manage" onClick={onManage}>
            ⚙ Manage accounts{pendingCount ? ` (${pendingCount} pending)` : ''}
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

// The Filters button — position, look and badge unchanged. What opens under it is
// now FilterPanel: a filter BUILDER (chips + a cascading Add-filter menu) instead
// of the fixed stack of dropdowns this used to hold, which grew a row taller with
// every new filter. The button owns only open/closed and the outside-click close.
//
// PHASE 4b — a Popover, not a Menu, and the distinction matters here more than
// anywhere else in this bar. FilterPanel holds inputs, chips and nested cascading
// columns with 505 lines of its own keyboard handling, including an Escape that
// unwinds ONE cascade level at a time instead of closing the lot. Inside a
// role="menu" that would be fighting arrow-key item navigation the whole way.
//
// So the primitive takes over exactly what the six-line `mousedown` listener did —
// open state, outside click, viewport-aware placement, focus return — and the panel
// keeps every inner behaviour it already had. `onClose` still works because it maps
// onto the same setter the trigger uses, so the panel can close the outermost level
// itself once it has unwound the inner ones.
function FiltersButton({ options, filters, patchFilters, clearFilters, active }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="tb-filters">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={`tb-btn ${active ? 'active' : ''}`} aria-label="Filters">
          <Icon d={<path d="M3 4h18l-7 8v6l-4 2v-8z" />} />
          <span>Filters</span>
          {active > 0 && <span className="tb-badge">{active}</span>}
        </PopoverTrigger>
        <PopoverContent>
          <FilterPanel
            options={options}
            filters={filters}
            patchFilters={patchFilters}
            clearFilters={clearFilters}
            active={active}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// The avatar opens a DROPDOWN (not a modal) with the user's identity + settings
// shortcuts. "Trade settings" still opens its own modal (column visibility etc.).
//
// PHASE 4b — on Base UI. Same markup, same classes, same order; the open/close state,
// the outside-click listener and the hand-written role="menu"/role="menuitem"
// attributes are gone because the primitive owns all four. Note what those roles were
// promising and not delivering: arrow-key navigation between items, Escape, and focus
// returning to the avatar. A screen reader was told this was a menu and then found
// none of a menu's behaviour. It is now actually one.
//
// `onClick` handlers no longer close the menu by hand — activating a MenuItem closes
// it. The two that open something else (Trade settings, Sign out) keep their handler
// and drop the setOpen call.
function UserMenu({ unit, tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns }) {
  const { user, logout } = useAuth();
  const [prefsOpen, setPrefsOpen] = useState(false);

  if (!user) return null;
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const plan = titleCase(user.plan || 'free');
  const avatar = user.picture
    ? <img className="tb-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
    : <span className="tb-avatar tb-avatar-fallback">{initial}</span>;

  return (
    <div className="tb-user">
      <Menu>
        <MenuTrigger className="tb-avatar-link" title="Account" aria-label="Account">
          {avatar}
        </MenuTrigger>
        <MenuContent className="tb-user-menu">
          {/* Identity and plan are information, not commands. As bare divs in a
              role="menu" they were orphan nodes; as a group label they are
              addressable, and the items below read as belonging to this account. */}
          <MenuGroup>
            <MenuGroupLabel className="tb-user-head">
              {avatar}
              <div className="tb-user-id">
                <span className="tb-user-name">{user.name || 'Account'}</span>
                <span className="tb-user-email">{user.email}</span>
              </div>
            </MenuGroupLabel>
            <div className="tb-user-plan">
              <span className="muted">Plan</span>
              <span className={`sb-plan-badge ${user.plan || 'free'}`}>{plan}</span>
            </div>
            <MenuSeparator className="tb-menu-sep" />
            <MenuItem className="tb-menu-item" onClick={() => setPrefsOpen(true)}>Trade settings</MenuItem>
            {/* `render` is how Base UI keeps an item's menu semantics while letting it
                be a router Link — the anchor is real, so middle-click and copy-link
                still work, which a div with an onClick would have broken. */}
            <MenuItem className="tb-menu-item" render={<Link to="/settings" />}>Settings</MenuItem>
            <MenuItem className="tb-menu-item" render={<Link to="/billing" />}>Manage plan</MenuItem>
            <MenuSeparator className="tb-menu-sep" />
            <MenuItem className="tb-menu-item danger" onClick={logout}>Sign out</MenuItem>
          </MenuGroup>
        </MenuContent>
      </Menu>
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
  // Publish this bar's height as --topbar-h. Anything else that wants to sit
  // directly beneath it while the page scrolls — the trade log's sticky column
  // header — reads that instead of hardcoding a guess: too small and the header
  // slides under the bar, too large and rows show through the gap. Measured, so it
  // survives a wrap onto two lines or a font change.
  const barRef = useRef(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const publish = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Which page you're on, resolved from the same NAV config the sidebar renders
  // — so the two can't disagree. null on an unrecognized path; render nothing
  // rather than guess a name.
  const title = navTitle(useLocation().pathname);

  return (
    <div className="topbar" ref={barRef}>
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
        <ThemeToggle theme={theme} setTheme={setTheme} />
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
