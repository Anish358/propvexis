import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import FilterBar from './FilterBar.jsx';
import { Toasts } from './Notifications.jsx';

// App shell: fixed left sidebar + a global filter bar + the routed page area.
// The display unit and data filters come from the active scope's ViewConfig
// (owned by App); they are no longer derived from the selected account.
export default function Layout({
  trades, account, accounts, payouts, reloadPayouts, fees, reloadFees, accountId, setAccountId, reloadAccounts,
  strategies, reloadStrategies, reloadTrades,
  notifications, unread, markAllNotificationsRead, toasts, dismissToast,
  connected, flashId, saveTrade, removeTrade, addManualTrade,
  unit, filters, filterOptions, setUnit, patchFilters, clearFilters,
  pinnedAccounts, setPinnedAccounts,
  dashLayout, setDashVisible, moveDashWidget, resetDashLayout,
  theme = 'dark', setTheme = () => {},
  briefPrefs, patchBriefPrefs, setBriefSection, resetBriefPrefs,
  tradeSettings, setBeRounding, setColumnVisible, resetColumns,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const toggleSidebar = () => setCollapsed((c) => !c);
  // The top bar owns a slot node for per-page actions; PageHeader portals into
  // it (callback ref → state so consumers re-render once the node exists).
  const [actionsSlot, setActionsSlot] = useState(null);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && <Sidebar onToggle={toggleSidebar} />}
      <main className="shell-main">
        <Toasts items={toasts} onDismiss={dismissToast} />
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
          reloadAccounts={reloadAccounts}
          tradeSettings={tradeSettings}
          setBeRounding={setBeRounding}
          setColumnVisible={setColumnVisible}
          resetColumns={resetColumns}
          theme={theme}
          setTheme={setTheme}
        />
        <Outlet context={{ trades, account, accountId, setAccountId, accounts, reloadAccounts, payouts, reloadPayouts, fees, reloadFees, strategies, reloadStrategies, reloadTrades, notifications, unread, markAllNotificationsRead, unit, filters, connected, flashId, saveTrade, removeTrade, addManualTrade, toggleSidebar, actionsSlot, pinnedAccounts, setPinnedAccounts, theme, setTheme, dashLayout, setDashVisible, moveDashWidget, resetDashLayout, briefPrefs, patchBriefPrefs, setBriefSection, resetBriefPrefs, tradeSettings, setBeRounding, setColumnVisible, resetColumns }} />
      </main>
    </div>
  );
}
