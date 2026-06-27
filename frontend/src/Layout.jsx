import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

// App shell: fixed left sidebar + routed page area. The header hamburger
// (PageHeader onMenu) toggles the sidebar, collapsing back to the full-width
// layout from step 1.
export default function Layout({ trades, account, accounts, accountId, setAccountId, reloadAccounts, connected, flashId, saveTrade, removeTrade }) {
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
        />
      )}
      <main className="shell-main">
        <Outlet context={{ trades, accountId, accounts, connected, flashId, saveTrade, removeTrade, toggleSidebar }} />
      </main>
    </div>
  );
}
