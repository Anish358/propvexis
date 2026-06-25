import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

// App shell: fixed left sidebar + routed page area. The header hamburger
// (PageHeader onMenu) toggles the sidebar, collapsing back to the full-width
// layout from step 1.
export default function Layout({ trades, account, connected, flashId, saveTrade, removeTrade }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggleSidebar = () => setCollapsed((c) => !c);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && <Sidebar trades={trades} account={account} />}
      <main className="shell-main">
        <Outlet context={{ trades, connected, flashId, saveTrade, removeTrade, toggleSidebar }} />
      </main>
    </div>
  );
}
