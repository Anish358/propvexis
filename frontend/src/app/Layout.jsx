import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import FilterBar from '../features/filters/FilterBar.jsx';
import { Toasts } from '../features/alerts/Notifications.jsx';
import VerifyBanner from '../features/auth/VerifyBanner.jsx';
import Announcer, { connectionAnnouncement, tradeFeedAnnouncement } from '../components/Announcer.jsx';
import { useIsMobile } from '../lib/useMediaQuery.js';

// App shell: fixed left sidebar + a global filter bar + the routed page area.
// The display unit and data filters come from the active scope's ViewConfig
// (owned by App); they are no longer derived from the selected account.
//
// Below 900px the sidebar becomes an off-canvas drawer instead: a 230px fixed
// rail on a 390px phone leaves 160px for a data table, which is not a layout.
export default function Layout({
  trades, tradesLoading = false, account, accounts, payouts, reloadPayouts, fees, reloadFees, accountId, setAccountId, reloadAccounts,
  strategies, reloadStrategies, reloadTrades,
  notifications, unread, markAllNotificationsRead, toasts, dismissToast,
  connected, flashId, saveTrade, removeTrade, addManualTrade,
  unit, filters, filterOptions, setUnit, patchFilters, clearFilters,
  pinnedAccounts, setPinnedAccounts,
  dashLayout, setDashVisible, moveDashWidget, resetDashLayout,
  propLayout, setPropVisible, resetPropLayout,
  briefPrefs, patchBriefPrefs, setBriefSection, resetBriefPrefs,
  tradeSettings, setBeRounding, setColumnVisible, resetColumns,
}) {
  const isMobile = useIsMobile();
  const location = useLocation();
  // On desktop this means "the user hid the rail". On mobile it means "the
  // drawer is shut", which is the correct default — hence the sync below.
  const [collapsed, setCollapsed] = useState(isMobile);
  const toggleSidebar = () => setCollapsed((c) => !c);
  // The top bar owns a slot node for per-page actions; PageHeader portals into
  // it (callback ref → state so consumers re-render once the node exists).
  const [actionsSlot, setActionsSlot] = useState(null);
  const drawerOpen = isMobile && !collapsed;

  // Crossing the breakpoint resets to that layout's sensible default: shut on
  // mobile, shown on desktop. Without this, rotating a phone with the drawer
  // open leaves a permanently-open rail eating the viewport.
  useEffect(() => { setCollapsed(isMobile); }, [isMobile]);

  // Navigating is the whole point of the drawer, so it must close itself on
  // arrival. Otherwise every tap leaves the destination hidden behind the menu
  // the user just used.
  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [location.pathname, isMobile]);

  // ---- Drawer behaviour: Escape, scroll lock, and focus return ----
  const restoreFocusTo = useRef(null);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    restoreFocusTo.current = document.activeElement;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setCollapsed(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    // The page behind a drawer must not scroll under the user's finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Send focus back where it came from, or the next Tab starts at the top
      // of the document — the classic "dismissed a dialog and lost my place".
      const target = restoreFocusTo.current;
      if (target && typeof target.focus === 'function' && document.contains(target)) target.focus();
    };
  }, [drawerOpen]);

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
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      {/* First focusable thing in the document. The sidebar is ~20 tab stops,
          so without this a keyboard user traverses the whole nav on every page
          to reach the content. Visually hidden until focused. */}
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Announcer message={announcement} />

      {!collapsed && <Sidebar onToggle={toggleSidebar} inDrawer={drawerOpen} />}
      {/* Scrim: dismisses the drawer, and hides the page behind it from assistive
          tech so the reading order does not run straight past the menu. */}
      {drawerOpen && (
        <div className="shell-scrim" onClick={() => setCollapsed(true)} aria-hidden="true" />
      )}

      {/* tabIndex -1 so the skip link can move focus here; it is not in the tab
          order itself. */}
      <main className="shell-main" id="main-content" tabIndex={-1}>
        <Toasts items={toasts} onDismiss={dismissToast} />
        {/* Above the filter bar, below the toasts: it is an account-level
            message, so it should not scroll away with the page content, and it
            renders nothing once the address is confirmed. */}
        <VerifyBanner />
        <FilterBar
          collapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          slotRef={setActionsSlot}
          unit={unit}
          filters={filters}
          options={filterOptions}
          setUnit={setUnit}
          patchFilters={patchFilters}
          clearFilters={clearFilters}
          notifications={notifications}
          unread={unread}
          onMarkAllRead={markAllNotificationsRead}
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          tradeSettings={tradeSettings}
          setBeRounding={setBeRounding}
          setColumnVisible={setColumnVisible}
          resetColumns={resetColumns}
        />
        <Outlet context={{ trades, tradesLoading, account, accountId, setAccountId, accounts, reloadAccounts, payouts, reloadPayouts, fees, reloadFees, strategies, reloadStrategies, reloadTrades, notifications, unread, markAllNotificationsRead, unit, filters, clearFilters, connected, flashId, saveTrade, removeTrade, addManualTrade, toggleSidebar, actionsSlot, pinnedAccounts, setPinnedAccounts, dashLayout, setDashVisible, moveDashWidget, resetDashLayout, propLayout, setPropVisible, resetPropLayout, briefPrefs, patchBriefPrefs, setBriefSection, resetBriefPrefs, tradeSettings, setBeRounding, setColumnVisible, resetColumns }} />
      </main>
    </div>
  );
}
