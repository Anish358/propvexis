import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import FilterBar from './FilterBar.jsx';

// App shell: fixed left sidebar + a global filter bar + the routed page area.
// The display unit and data filters come from the active scope's ViewConfig
// (owned by App); they are no longer derived from the selected account.
export default function Layout({
  trades, account, accounts, accountId, setAccountId, reloadAccounts,
  connected, flashId, saveTrade, removeTrade, addManualTrade,
  unit, filters, filterOptions, setUnit, patchFilters, clearFilters,
  widgetOverrides, setWidgetVisible, resetWidgets,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const toggleSidebar = () => setCollapsed((c) => !c);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <Sidebar
          trades={trades}
          account={account}
          accounts={accounts}
          accountId={accountId}
          setAccountId={setAccountId}
          reloadAccounts={reloadAccounts}
          unit={unit}
        />
      )}
      <main className="shell-main">
        <FilterBar
          unit={unit}
          filters={filters}
          options={filterOptions}
          setUnit={setUnit}
          patchFilters={patchFilters}
          clearFilters={clearFilters}
        />
        <Outlet context={{ trades, account, accountId, accounts, unit, filters, connected, flashId, saveTrade, removeTrade, addManualTrade, toggleSidebar, widgetOverrides, setWidgetVisible, resetWidgets }} />
      </main>
    </div>
  );
}
