import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Filter, Moon, Settings, Star, Sun } from 'lucide-react';
import { activeFilterCount } from './filters.js';
import { navTitle } from './nav.js';
import { titleCase } from './constants.js';
import FilterPanel from './FilterPanel.jsx';
// PHASE 4b (overlays) + PHASE 4c (the controls themselves).
//
// 4b put this bar's four overlays on Base UI but left every TRIGGER on its legacy
// class — `.tb-btn`, `.fb-unit-btn`, `.acct-switch-btn`, `.tb-icon-btn`,
// `.tb-avatar-link`. Behaviour migrated; the visible bar did not, which is the
// failure mode DESIGN-LANGUAGE "Legacy CSS is not a layer" was written to name:
// legacy CSS is unlayered and therefore beats every Tailwind utility the preset
// emits, so a reskin that leaves the legacy rule standing has changed nothing.
//
// 4c is the other half. Each control below is now a generated component — Button,
// ToggleGroup, Avatar — and the legacy rules that used to paint them are DELETED
// from styles/legacy/app.css rather than overridden. Structure, order, state and
// handlers are untouched; only the painting moves.
// `variant="chrome"` is the shared identity of this bar's quiet controls — the four
// legacy rules that used to paint them individually collapsed into one word; see
// components/primitives/button.jsx. No appearance is spelled out in this file: a page
// may not originate visual values (pinned by topbar-overlays.test.js), so what stays
// here is geometry the preset has no opinion about — a width cap, a truncation.
import {
  Avatar, AvatarFallback, AvatarImage,
  Button, CountBadge,
  Menu, MenuCheckboxItem, MenuContent, MenuGroup, MenuGroupLabel, MenuItem,
  MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger,
  ToggleGroupExclusive, ToggleGroupItem,
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
//
// PHASE 4c — a chrome icon Button, replacing `.tb-icon-btn`. The two hand-written SVG
// paths are lucide's `Sun` and `Moon`: `components.json` sets `iconLibrary: "lucide"`,
// and the generated Button already sizes any `svg` child it is given, so the explicit
// width/height this used to carry is now the component's business rather than each
// icon's. `size="icon-sm"` is the same square the bell uses, so "matches the
// notification bell's footprint" is true by construction now instead of by two legacy
// rules agreeing on 30px.
function ThemeToggle({ theme, setTheme }) {
  const toLight = theme !== 'light';
  return (
    <Button
      variant="chrome"
      size="icon-sm"
      onClick={() => setTheme(toLight ? 'light' : 'dark')}
      title={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {toLight ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

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
    <div className="tb-acct">
      <Menu>
        {/* PHASE 4c. `.acct-switch-btn` is deleted; this is the generated Button in
            its `secondary` tone — a filled surface, which is what the legacy rule
            drew (`--surface-2`) and what distinguishes the current scope from the
            ghost controls either side of it.
            `render` rather than a nested button: MenuTrigger must BE the button so
            it keeps aria-haspopup/aria-expanded on the focusable element. The
            generated Button reads `aria-expanded` itself (`aria-expanded:bg-…`), so
            the open state paints without a class of ours. */}
        <MenuTrigger render={<Button variant="tinted" size="sm" />}>
          {/* Long account labels truncate rather than widening the bar. The width cap
              and the ellipsis are A1 geometry, not styling the preset owns — and they
              live in legacy CSS on `.tb-acct` / `.acct-switch-cur` rather than as
              utilities here, because Tailwind's `@source` is scoped to
              `components/` (deliberately — see tailwind.css). A utility written in a
              page is never compiled, so it is not a shortcut, it is a no-op. */}
          <span className="acct-switch-cur">{current || 'Select account'}</span>
          <ChevronDown aria-hidden="true" data-icon="inline-end" />
        </MenuTrigger>
        {/* PRESET SKIN. The surface, item metrics and separator are the generated
            component's now; `.acct-menu` survives holding only the scroll box, which is
            A1 geometry the preset has no opinion about. `.acct-opt*` is gone — the one
            row that still needs a class is the selected one, and `.acct-opt-sel` says
            only that. */}
        <MenuContent className="acct-menu">
          {/* The `★` and `⚙` literals become lucide icons: a text glyph inherits the
              row's font metrics and lands at a different size in every typeface,
              where an icon is sized by the menu item itself. Same two meanings. */}
          <MenuItem className={accountId === GOD ? 'acct-opt-sel' : ''} onClick={() => setAccountId(GOD)}>
            <Star aria-hidden="true" />
            All accounts <span className="acct-opt-sub">God view</span>
          </MenuItem>
          {bound.map((a) => (
            /* The hand-rolled <input type="checkbox"> is gone: the generated item
               renders its own indicator from `checked`, so the state is expressed once
               instead of being mirrored into a decorative aria-hidden input. */
            <MenuCheckboxItem
              key={a.id}
              className={isSel(a.mt5_login) ? 'acct-opt-sel' : ''}
              checked={isSel(a.mt5_login)}
              onCheckedChange={() => toggle(a.mt5_login)}
            >
              <span className="acct-opt-name">{acctLabel(a)}</span>
              <span className="acct-opt-sub">{a.kind === 'manual' ? 'Manual' : a.mt5_login}</span>
            </MenuCheckboxItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={onManage}>
            <Settings aria-hidden="true" />
            Manage accounts{pendingCount ? ` (${pendingCount} pending)` : ''}
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
        {/* PHASE 4c. `.tb-btn` and `.tb-badge` are deleted; `variant="chrome"` IS that
            first rule, and `active` is `.tb-btn.active` — the label sits at full
            strength once any filter is set, because a bar with filters applied has to
            look different from one without. Both now say what they mean instead of
            naming a colour. */}
        <PopoverTrigger render={<Button variant="chrome" size="sm" active={active > 0} />}>
          <Filter aria-hidden="true" />
          <span>Filters</span>
          {active > 0 && <CountBadge>{active}</CountBadge>}
        </PopoverTrigger>
        {/* `surface="none"` because this popover's CONTENT is already made of panels:
            `FilterPanel` renders `.fp-stack`, a container for the panel and its cascade
            columns, each drawing its own background, border and shadow. A box here would
            paint a second panel behind the real ones. Positioning, dismissal and the
            §10 animation are still the primitive's. */}
        <PopoverContent surface="none">
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
  // PHASE 4c — the generated Avatar. This replaces a hand-built pair (`<img>` OR a
  // fallback `<span>`, chosen by whether `user.picture` is truthy) with one component
  // that renders both and swaps on the image's actual load result. The old test could
  // only ask whether a URL was present: a Google avatar URL that 404s or is blocked
  // by the referrer policy left a broken image where the initial should have been.
  // `size="sm"` is 24px, the footprint the legacy 28px rule sat closest to on the
  // component's own scale.
  const avatar = (
    <Avatar size="sm">
      <AvatarImage src={user.picture || undefined} alt="" referrerPolicy="no-referrer" />
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );

  return (
    <div className="tb-user">
      <Menu>
        {/* A chrome icon Button holding the avatar, replacing `.tb-avatar-link`. The
            legacy hover brightened a border that was otherwise transparent; §13 gives
            a borderless control a surface hover instead, which is what `chrome`
            already does — so the state is inherited rather than restated.
            The hover target has to be circular to match the avatar inside it; that is
            one declaration on `.tb-user` in legacy CSS, for the same @source reason as
            the account switcher above. */}
        <MenuTrigger
          render={<Button variant="chrome" size="icon-sm" />}
          title="Account"
          aria-label="Account"
        >
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
            {/* PRESET SKIN. `.tb-menu-item` and `.tb-menu-sep` are deleted — item
                padding, radius, size and focus background are the generated
                component's. Sign out uses the component's own `variant="destructive"`
                rather than a `.danger` class; `--destructive` is bridged to `--loss`, so
                it is the same colour reached through the library's API. */}
            <MenuSeparator />
            <MenuItem onClick={() => setPrefsOpen(true)}>Trade settings</MenuItem>
            {/* `render` is how Base UI keeps an item's menu semantics while letting it
                be a router Link — the anchor is real, so middle-click and copy-link
                still work, which a div with an onClick would have broken. */}
            <MenuItem render={<Link to="/settings" />}>Settings</MenuItem>
            <MenuItem render={<Link to="/billing" />}>Manage plan</MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={logout}>Sign out</MenuItem>
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
        {/* PHASE 4c. `.fb-unit` / `.fb-unit-btn` are deleted; this is a real
            ToggleGroup. The old version was two independent <button>s in a
            role="group" whose selected state existed only as a CSS class — visually
            a segmented control, and to a screen reader two unrelated buttons with no
            indication that either was chosen. `data-pressed` and arrow-key
            navigation between the segments come from the primitive.
            `ToggleGroupExclusive` is the wrapper that refuses to end up with
            neither unit pressed; see components/primitives/toggle-group.jsx. */}
        <ToggleGroupExclusive value={unit} onValueChange={setUnit} aria-label="Display unit">
          <ToggleGroupItem value="R" size="sm">R</ToggleGroupItem>
          <ToggleGroupItem value="USD" size="sm">$</ToggleGroupItem>
        </ToggleGroupExclusive>
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
