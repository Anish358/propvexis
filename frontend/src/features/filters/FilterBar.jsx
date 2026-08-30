import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
// `Menu as MenuIcon` — the primitives barrel below already exports a `Menu`
// component, and the icon would silently shadow it.
import { Bell, ChevronDown, Filter, Menu as MenuIcon, Settings, Star } from 'lucide-react';
import { activeFilterCount } from './filters.js';
import { navTitle, isSingleAccountRoute } from '../../app/nav.js';
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
  Badge, Button, ButtonDot, ButtonLabel, CountBadge,
  Menu, MenuCheckboxItem, MenuContent, MenuGroupLabel, MenuItem,
  MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger,
  ToggleGroupExclusive, ToggleGroupItem,
  TopBar, TopBarActions, TopBarTitle,
} from '@/components/primitives';
import { NotificationBell } from '../alerts/Notifications.jsx';


// The phase as a short tag for the switcher's scope summary — the same vocabulary the
// account wizard uses for a name suffix, for the same reason: "Phase 2" does not fit
// three times in a top-bar pill.
const PHASE_TAG = { p1: 'P1', p2: 'P2', p3: 'P3', funded: 'Funded' };
// Lifecycle order, so a scope summary reads "P1 · P2 · Funded" however the accounts
// happen to be sorted. A summary whose order follows the account list is a summary that
// changes when an account is added.
const PHASE_ORDER = ['P1', 'P2', 'P3', 'Funded'];

// 'all' = every ACTIVE account, resolved server-side to that concrete login list.
// It is a shorthand for a selection, not a privileged scope — the god view it used
// to name (filtering by owner, and the only place account-less trades appeared) was
// removed with migration 0028.
const ALL = 'all';
const acctLabel = (a) => a.label || `MT5 ${a.mt5_login}`;

// Account selector (top-right): "All accounts" + each BOUND account as a
// multi-select checkbox, plus a "Manage accounts" entry. The selection is 'all'
// or a comma-joined list of mt5 logins; picking two or more accounts gives
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
//
// SINGLE-SELECT MODE. On the routes nav.js names in SINGLE_ACCOUNT_ROUTES the rows
// become plain `MenuItem`s that REPLACE the selection instead of adding to it, and
// the menu closes on pick like any other one-of-many choice. The reason is on that
// constant: Prop OS > Accounts > Details is a single-account workspace, and an
// aggregate max drawdown across three accounts at two firms is not a number that
// exists. Expressed as role="menuitem" rather than a checkbox item that happens to
// behave differently, so a screen reader is told it is a one-of-many choice rather
// than being told "checkbox" and then finding the other boxes clear themselves.
// "All accounts" stays: it is a selection of everything active, and it is what the
// page shows before an account has been picked.
function AccountSwitcher({ accounts = [], accountId, setAccountId, singleSelect = false, notifications = [] }) {
  // Bound + active only; archived accounts stay out of the switcher (still in the modal).
  const bound = accounts.filter((a) => !a.pending && a.is_active !== false);
  const pendingCount = accounts.filter((a) => a.pending && a.is_active !== false).length;

  const selected = accountId === ALL ? [] : String(accountId).split(',');
  const isSel = (login) => selected.includes(String(login));
  const toggle = (login) => {
    const key = String(login);
    const next = isSel(key) ? selected.filter((l) => l !== key) : [...selected, key];
    const sorted = next.map(Number).sort((a, b) => a - b).map(String);
    setAccountId(sorted.length ? sorted.join(',') : ALL);
  };
  // Single-select REPLACES rather than accumulates, and never empties the selection
  // by re-clicking the current account — "All accounts" is the row for that.
  const pick = (login) => setAccountId(String(login));

  /* THE LABEL CARRIES ITS COUNT (Rhea: "All accounts · 5"). It used to read just
   * "All accounts", which says the scope is everything without saying how much
   * everything is — and "everything" is 2 accounts for one trader and 11 for another. */
  let current;
  if (accountId === ALL) current = bound.length ? `All accounts · ${bound.length}` : 'All accounts';
  else if (selected.length === 1) current = acctLabel(bound.find((a) => String(a.mt5_login) === selected[0]) || {});
  else current = `${selected.length} Accounts`;

  /* WHICH accounts, not just how many. Phases rather than logins, because that is what a
   * trader is actually scoping by, and three of them fit where three five-digit numbers
   * do not. Shown for "All accounts" TOO as of Rhea — "All accounts · 5" still does not say
   * whether those five are evaluations or funded, and that changes what every figure on
   * the page means. Deduped and in lifecycle order, so it reads "P1 · P2 · Funded"
   * rather than repeating a phase once per account. */
  const summaryOf = (list) => {
    const tags = new Set(list.map((a) => PHASE_TAG[a.phase] || a.phase).filter(Boolean));
    return PHASE_ORDER.filter((t) => tags.has(t)).join(' · ') || null;
  };
  /* THE DOT'S TONE COMES FROM THE ALERT STREAM, which the bar already receives — no new
   * plumbing, and no invented health. An unread critical notification means an account
   * in this scope is in trouble; that is the same signal the Alerts page and the bell
   * are reading, so the three cannot disagree. */
  const worst = notifications.find((n) => !n.read_at && n.severity === 'critical') ? 'bad'
    : notifications.find((n) => !n.read_at && n.severity === 'warning') ? 'warn' : 'ok';
  const scopeTone = bound.length ? worst : 'none';

  const scopeSummary = accountId === ALL
    ? summaryOf(bound)
    : (selected.length > 1 ? summaryOf(bound.filter((a) => isSel(a.mt5_login))) : null);

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
        <MenuTrigger render={<Button variant="tinted" size="sm" pill />}>
          {/* Long account labels truncate rather than widening the bar. The width cap
              and the ellipsis are A1 geometry, not styling the preset owns — and they
              live in legacy CSS on `.tb-acct` / `.acct-switch-cur` rather than as
              utilities here, because Tailwind's `@source` is scoped to
              `components/` (deliberately — see tailwind.css). A utility written in a
              page is never compiled, so it is not a shortcut, it is a no-op. */}
          {/* THE FRAME'S TRIGGER: a scope icon, the count, and a muted summary of WHICH
              accounts — "3 Accounts · P1 · P2 · Funded". The label alone ("2 accounts")
              said how many without saying which, so the one thing a multi-account trader
              checks before reading any figure was a click away.

              THE MENU BEHIND IT IS UNCHANGED, deliberately. @coss ships a Combobox and it
              was read first: 15 KB, searchable, chips, its own input and scroll-area. This
              control is a multi-SELECT with all-accounts semantics (`all` vs a comma-joined
              login list), a single-select mode on two routes, and a pending-accounts
              footer — all tested. Swapping it would trade working behaviour for a
              different-looking trigger, which is the half we can just draw. */}
          {/* A DOT, NOT A GLYPH (Rhea). The layers icon said "this is a scope control",
              which the label already says; the dot says whether the accounts IN that
              scope are healthy, which nothing else in the bar does. */}
          <ButtonDot tone={scopeTone} />
          <span className="acct-switch-cur">{current || 'Select account'}</span>
          {scopeSummary && <span className="acct-switch-sub">{scopeSummary}</span>}
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
          <MenuItem className={accountId === ALL ? 'acct-opt-sel' : ''} onClick={() => setAccountId(ALL)}>
            <Star aria-hidden="true" />
            All accounts <span className="acct-opt-sub">Every active account</span>
          </MenuItem>
          {bound.map((a) => {
            /* A ROW THAT SAYS WHAT THE ACCOUNT IS (2026-08-28). It used to read a label
               and then either "Manual" or a five-digit login — the login is the least
               useful thing about an account you are choosing BY NAME, and "Manual" is
               how trades arrive, not what the account is.
               What a trader picks by is the phase, so that is the badge; the connection
               kind stays as quiet text for the manual case, where it does explain why
               there is no live balance. Uses the Badge primitive rather than a fourth
               hand-styled span, so it matches the phase badges in Prop OS. */
            const row = (
              <>
                <span className="acct-opt-name">{acctLabel(a)}</span>
                {PHASE_TAG[a.phase] && (
                  <Badge tone={a.phase === 'funded' ? 'profit' : 'neutral'}>
                    {PHASE_TAG[a.phase]}
                  </Badge>
                )}
                {a.kind === 'manual' && <span className="acct-opt-sub">Manual</span>}
              </>
            );
            return singleSelect ? (
              <MenuItem
                key={a.id}
                className={isSel(a.mt5_login) ? 'acct-opt-sel' : ''}
                onClick={() => pick(a.mt5_login)}
              >
                {row}
              </MenuItem>
            ) : (
              /* The hand-rolled <input type="checkbox"> is gone: the generated item
                 renders its own indicator from `checked`, so the state is expressed once
                 instead of being mirrored into a decorative aria-hidden input. */
              <MenuCheckboxItem
                key={a.id}
                className={isSel(a.mt5_login) ? 'acct-opt-sel' : ''}
                checked={isSel(a.mt5_login)}
                onCheckedChange={() => toggle(a.mt5_login)}
              >
                {row}
              </MenuCheckboxItem>
            );
          })}
          <MenuSeparator />
          {/* A LINK, NOT A DIALOG. Managing accounts is a page now — Settings >
              Accounts — so this navigates there instead of opening a modal that
              held a second copy of the same list. `render` keeps the row's menu
              semantics while making the anchor real, so middle-click and
              copy-link work; the two rows below it already do this. */}
          <MenuItem render={<Link to="/settings/accounts" />}>
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
        {/* ICON ONLY (2026-08-28). The word "Filters" was the only label left in a row
            of glyphs, so the bar read as one text button among icons. The funnel is the
            universal mark for this and the count badge already says whether anything is
            on; the accessible name moves to aria-label, which is what an icon-only
            control owes a reader. */}
        {/* LABELLED AGAIN (Rhea, and the design is explicit). It was icon-only on the
            argument that the bar read as one text button among glyphs — true of the
            intermediate pass, where the switcher was a bare pill. Rhea's bar has TWO
            labelled controls (this and the scope) against two glyphs, so the funnel
            alone now reads as the odd one out instead. The label drops below 1200,
            where the bar genuinely runs out of room, and the aria-label carries the
            name in both cases. */}
        <PopoverTrigger render={(
          <Button
            variant="chrome"
            size="sm"
            active={active > 0}
            pill
            aria-label={active > 0 ? `Filters — ${active} active` : 'Filters'}
            title="Filters"
          />
        )}>
          <Filter aria-hidden="true" />
          <ButtonLabel>Filters</ButtonLabel>
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

/* `UserMenu` IS GONE (2026-08-28). It was the top bar's avatar and the menu behind it.
 *
 * Everything it held has a verified home: TradeSettingsModal is mounted by TradeLog.jsx
 * with its own trigger (checked, not assumed — it is the page the settings apply to),
 * Manage plan is a Settings route, and Sign out is Settings > Session, which the rail's
 * identity row links to. The rail already showed the same person's name, plan and
 * avatar 40px away, so the bar's copy was the second one.
 */

// The single global bar. Left: only the sidebar re-opener, when the sidebar is
// collapsed. Middle→right: per-page actions portaled in from PageHeader
// (slotRef). Right: the view controls (unit + filters) followed by the always-on
// controls — account scope switcher, notifications, account avatar. Page content
// starts directly below this bar (pages no longer render their own header row).
export default function FilterBar({
  unit, filters, options, setUnit, patchFilters, clearFilters,
  notifications = [], unread = 0, onMarkAllRead,
  accounts = [], accountId = 'all', setAccountId = () => {},
  tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
  showNavButton = false, navOpen = false, onToggleSidebar = () => {}, slotRef,
}) {
  const active = activeFilterCount(filters);
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
  const { pathname } = useLocation();
  const title = navTitle(pathname);
  // Whether the account switcher is single-select is a property of the ROUTE, and
  // nav.js is where the app's route facts live — so the bar asks the IA rather than
  // a page reaching up to reconfigure the bar it does not own.
  const singleAccount = isSingleAccountRoute(pathname);

  /* NO GREETING (Rhea, 2026-08-29). The dashboard's title used to carry a second line —
   * "Good afternoon, Anish" — and Rhea's bar is 64px of ONE line. Two things went with
   * it: the bar's extra height, and a title block that was a different shape on the
   * dashboard than on every other route. The greeting was a nice touch that cost the
   * chrome its consistency, and the design settles it. */

  return (
    <TopBar ref={barRef}>
      {/* MOBILE ONLY (2026-08-29, Rhea). This used to appear whenever the rail was
          `collapsed`, because collapsing REMOVED the rail and this button was the only
          way back. Rhea collapses to a 70px icon rail that carries its own expand
          control, so the only state with no rail on screen is the under-900 drawer —
          and a drawer with no trigger is a menu nobody can open. */}
      {showNavButton && (
        <Button
          variant="chrome"
          size="icon-sm"
          onClick={onToggleSidebar}
          title="Open menu"
          aria-label="Open menu"
          aria-expanded={navOpen}
        >
          <MenuIcon aria-hidden="true" />
        </Button>
      )}
      {title && (
        <TopBarTitle module={title.module}>{title.page}</TopBarTitle>
      )}

      {/* Per-page actions portal here (PageHeader → this node). */}
      <div className="tb-page" ref={slotRef} />

      <TopBarActions>
        {/* PHASE 4c. `.fb-unit` / `.fb-unit-btn` are deleted; this is a real
            ToggleGroup. The old version was two independent <button>s in a
            role="group" whose selected state existed only as a CSS class — visually
            a segmented control, and to a screen reader two unrelated buttons with no
            indication that either was chosen. `data-pressed` and arrow-key
            navigation between the segments come from the primitive.
            `ToggleGroupExclusive` is the wrapper that refuses to end up with
            neither unit pressed; see components/primitives/toggle-group.jsx. */}
        {/* The frame wraps the two segments in a bordered capsule rather than letting
            them float; `pill` on the group is what makes the container read as one
            control with two states instead of two adjacent buttons. */}
        {/* ORDER: unit -> filters -> scope -> bell, which is Rhea's and reverses the
            2026-08-28 arrangement that put the scope first.
            The old argument was that the scope changes what every figure MEANS, so it
            should be read first. Rhea's answer is that the cluster reads RIGHT to left
            in importance — the controls nearest the page's own content are the ones you
            reach for most — and the scope is the widest, most-labelled control in the
            row, so it anchors the right-hand end rather than competing with the title
            at the left. The bell is chrome and sits outside the group entirely. */}
        <ToggleGroupExclusive value={unit} onValueChange={setUnit} aria-label="Display unit" pill>
          <ToggleGroupItem value="R" size="sm">R</ToggleGroupItem>
          <ToggleGroupItem value="USD" size="sm">$</ToggleGroupItem>
        </ToggleGroupExclusive>
        <FiltersButton options={options} filters={filters} patchFilters={patchFilters} clearFilters={clearFilters} active={active} />
        <AccountSwitcher
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          singleSelect={singleAccount}
          notifications={notifications}
        />
        <NotificationBell inline notifications={notifications} unread={unread} onMarkAllRead={onMarkAllRead} />
        {/* NO AVATAR MENU HERE (2026-08-28, owner call). The rail's footer already
            carries the identity row — name, plan and a link to the profile — so a second
            avatar 40px away was the same person twice. Its MENU items had somewhere to
            go: Trade settings opens from the Trade Log where it applies, Manage plan and
            Sign out live in Settings, which the rail row links to. */}
</TopBarActions>
    </TopBar>
  );
}
