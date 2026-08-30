import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RailProvider, useRail } from '@/components/primitives';
import Sidebar from './Sidebar.jsx';
import FilterBar from '../features/filters/FilterBar.jsx';
import { Toasts } from '../features/alerts/Notifications.jsx';
import VerifyBanner from '../features/auth/VerifyBanner.jsx';
import Announcer, { connectionAnnouncement, tradeFeedAnnouncement } from '../components/Announcer.jsx';

/* App shell: the navigation rail + a global filter bar + the routed page area.
 *
 * THE RAIL'S STATE MOVED OUT OF THIS FILE (2026-08-29, Rhea). It used to live here as
 * a single `collapsed` boolean that meant two different things — "the user hid the
 * rail" on desktop, "the drawer is shut" on mobile — plus ~40 lines re-implementing
 * Escape, body-scroll lock, focus return and a scrim.
 *
 * All of that is now RailProvider (the generated shadcn SidebarProvider), which
 * separates the two states properly: `open` is the desktop 248 <-> 70 icon collapse
 * Rhea asks for, `openMobile` is the drawer. THE DRAWER BEHAVIOUR IS STRICTLY BETTER
 * FOR BEING GIVEN AWAY: it is a Base UI Dialog now, so Escape, the scroll lock, the
 * scrim, the focus TRAP (which the hand-rolled version never had) and focus return
 * are the library's, tested upstream, instead of four effects here.
 *
 * WHAT THIS FILE KEPT, because it is ours and not the library's: the skip link, the
 * live-region announcer, and closing the drawer on navigation.
 *
 * Below 900px the rail leaves the flow entirely rather than narrowing — a 248px rail
 * on a 390px phone leaves 140px for a data table, which is not a layout you fix by
 * shrinking it. 900 is set in TWO places that must agree (bridge.css's --breakpoint-md
 * and hooks/use-mobile.js); sidebar-breakpoint.test.js pins that they do.
 */
export default function Layout({
  trades, tradesLoading = false, account, accounts, payouts, reloadPayouts, fees, reloadFees, accountId, setAccountId, reloadAccounts,
  strategies, reloadStrategies, reloadTrades,
  notifications, unread, markAllNotificationsRead, markNotificationRead, toasts, dismissToast,
  connected, flashId, saveTrade, removeTrade, addManualTrade,
  unit, filters, filterOptions, setUnit, patchFilters, clearFilters,
  pinnedAccounts, setPinnedAccounts,
  dashLayout, setDashVisible, moveDashWidget, resetDashLayout,
  propLayout, setPropVisible, resetPropLayout,
  briefPrefs, patchBriefPrefs, setBriefSection, resetBriefPrefs,
  tradeSettings, setBeRounding, setColumnVisible, resetColumns,
}) {
  // The top bar owns a slot node for per-page actions; PageHeader portals into it
  // (callback ref -> state so consumers re-render once the node exists).
  const [actionsSlot, setActionsSlot] = useState(null);

  // ---- Announcements (see components/Announcer.jsx) ----
  const [announcement, setAnnouncement] = useState('');
  const prevCount = useRef(null);
  const prevConnected = useRef(null);
  useEffect(() => {
    const next = Array.isArray(trades) ? trades.length : null;
    const msg = tradeFeedAnnouncement(prevCount.current, next);
    prevCount.current = next;
    if (msg) setAnnouncement(msg);
  }, [trades]);
  useEffect(() => {
    const msg = connectionAnnouncement(prevConnected.current, connected);
    prevConnected.current = connected;
    if (msg) setAnnouncement(msg);
  }, [connected]);

  return (
    <RailProvider className="shell">
      {/* First focusable thing in the document. The rail is ~20 tab stops, so without
          this a keyboard user traverses the whole nav on every page to reach the
          content. Visually hidden until focused. */}
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Announcer message={announcement} />

      <Sidebar />

      {/* Everything that needs the rail's state lives below the provider, because a
          hook cannot read a context its own component supplies. */}
      <Shell
        actionsSlot={actionsSlot}
        setActionsSlot={setActionsSlot}
        toasts={toasts}
        dismissToast={dismissToast}
        unit={unit}
        filters={filters}
        filterOptions={filterOptions}
        setUnit={setUnit}
        patchFilters={patchFilters}
        clearFilters={clearFilters}
        notifications={notifications}
        unread={unread}
        markAllNotificationsRead={markAllNotificationsRead}
        accounts={accounts}
        accountId={accountId}
        setAccountId={setAccountId}
        tradeSettings={tradeSettings}
        setBeRounding={setBeRounding}
        setColumnVisible={setColumnVisible}
        resetColumns={resetColumns}
        outletContext={{
          trades, tradesLoading, account, accountId, setAccountId, accounts, reloadAccounts,
          payouts, reloadPayouts, fees, reloadFees, strategies, reloadStrategies, reloadTrades,
          notifications, unread, markAllNotificationsRead, markNotificationRead,
          unit, filters, clearFilters,
          connected, flashId, saveTrade, removeTrade, addManualTrade, actionsSlot,
          pinnedAccounts, setPinnedAccounts, dashLayout, setDashVisible, moveDashWidget,
          resetDashLayout, propLayout, setPropVisible, resetPropLayout, briefPrefs,
          patchBriefPrefs, setBriefSection, resetBriefPrefs, tradeSettings, setBeRounding,
          setColumnVisible, resetColumns,
        }}
      />
    </RailProvider>
  );
}

/* The routed half of the shell. Split out for ONE reason: `useRail` reads the context
 * RailProvider supplies, and a component cannot read its own provider — so anything
 * that needs the rail's state has to be a child of it.
 *
 * `toggleSidebar` reaches the outlet context from here rather than from Layout, so a
 * page that wants to open the nav (there is one) still can. */
function Shell({ actionsSlot, setActionsSlot, toasts, dismissToast, outletContext, ...bar }) {
  const { isMobile, openMobile, setOpenMobile, toggleSidebar } = useRail();
  const { pathname } = useLocation();

  /* NAVIGATING CLOSES THE DRAWER, and this is the one drawer behaviour the library
   * does not supply — it has no idea the app routed. Without it every tap leaves the
   * destination hidden behind the menu the user just used to reach it.
   *
   * Desktop is deliberately untouched: collapsing the rail on navigation would undo a
   * choice the user made on purpose. */
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  return (
    /* tabIndex -1 so the skip link can move focus here; it is not in the tab order
       itself. */
    <main className="shell-main" id="main-content" tabIndex={-1}>
      <Toasts items={toasts} onDismiss={dismissToast} />
      {/* Above the filter bar, below the toasts: it is an account-level message, so it
          should not scroll away with the page content, and it renders nothing once the
          address is confirmed. */}
      <VerifyBanner />
      <FilterBar
        /* THE BAR'S NAV BUTTON IS NOW A MOBILE-ONLY CONCERN, and the rename is the
           point. It used to appear whenever `collapsed` was true, because collapsing
           REMOVED the rail and this was the only way back. An icon rail is still on
           screen and carries its own expand control, so the only state with no visible
           rail is the under-900 drawer. */
        showNavButton={isMobile}
        navOpen={openMobile}
        onToggleSidebar={toggleSidebar}
        slotRef={setActionsSlot}
        {...bar}
      />
      <Outlet context={{ ...outletContext, toggleSidebar }} />
    </main>
  );
}
