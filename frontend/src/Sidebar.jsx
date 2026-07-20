import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ACCOUNT_START, fmtMoney } from './metrics.js';
import AccountsModal from './AccountsModal.jsx';
import { NAV } from './nav.js';
import { BRAND } from './theme.js';

const GOD = 'all';
const acctLabel = (a) => a.label || `MT5 ${a.mt5_login}`;

// Account selector: "All accounts (God)" + each BOUND account, plus a
// "Manage accounts" entry. Pending accounts (no trades yet) live in the modal.
function AccountSwitcher({ accounts = [], accountId, setAccountId, onManage }) {
  const [open, setOpen] = useState(false);
  // Bound + active only; archived accounts stay out of the switcher (still in the modal).
  const bound = accounts.filter((a) => !a.pending && a.is_active !== false);
  const pendingCount = accounts.filter((a) => a.pending && a.is_active !== false).length;
  const current =
    accountId === GOD
      ? 'All accounts'
      : acctLabel(accounts.find((a) => String(a.mt5_login) === String(accountId)) || {});
  const pick = (id) => { setAccountId(id); setOpen(false); };

  return (
    <div className="acct-switch">
      <button className="acct-switch-btn" onClick={() => setOpen((o) => !o)}>
        <span className="acct-switch-cur">{current || 'Select account'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="acct-menu">
          <button className={`acct-opt ${accountId === GOD ? 'sel' : ''}`} onClick={() => pick(GOD)}>
            ★ All accounts <span className="acct-opt-sub">God view</span>
          </button>
          {bound.map((a) => (
            <button
              key={a.id}
              className={`acct-opt ${String(accountId) === String(a.mt5_login) ? 'sel' : ''}`}
              onClick={() => pick(String(a.mt5_login))}
            >
              {acctLabel(a)} <span className="acct-opt-sub">{a.kind === 'manual' ? 'Manual' : a.mt5_login}</span>
            </button>
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

// Icon registry — nav.js references these by string key so the IA config stays
// JSX-free (and testable from node). Add a key here when adding one there.
const svg = (paths) => () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);
const ICONS = {
  dashboard: svg(<>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </>),
  journal: svg(<>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </>),
  prop: svg(<>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
  </>),
  analytics: svg(<>
    <path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" />
  </>),
  reports: svg(<>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" />
  </>),
  settings: svg(<>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>),
  account: svg(<>
    <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" />
  </>),
};

// One flat rail item.
function RailLink({ to, label, icon, end }) {
  const Icon = ICONS[icon] || ICONS.dashboard;
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}>
      <Icon /><span>{label}</span>
    </NavLink>
  );
}

// A module group: header toggles an inline (accordion) sub-nav. Auto-expands
// while the route is inside the module; the user can still collapse/expand it.
function RailGroup({ item }) {
  const { pathname } = useLocation();
  const inModule = pathname === item.base || pathname.startsWith(item.base + '/');
  const [override, setOverride] = useState(null); // null = follow the route
  const expanded = override ?? inModule;
  const Icon = ICONS[item.icon] || ICONS.dashboard;

  return (
    <div className={`sb-group ${expanded ? 'open' : ''}`}>
      <button
        className={`sb-item sb-group-head ${inModule && !expanded ? 'active' : ''}`}
        onClick={() => setOverride(!expanded)}
        aria-expanded={expanded}
      >
        <Icon /><span>{item.label}</span>
        <svg className="sb-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {expanded && (
        <div className="sb-sub">
          {item.children.map((c) => (
            <NavLink key={c.to} to={c.to} end={c.end} className={({ isActive }) => `sb-sub-item ${isActive ? 'active' : ''}`}>
              <span>{c.label}</span>
              {c.soon && <span className="sb-soon">soon</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ trades = [], account = null, accounts = [], accountId = 'all', setAccountId = () => {}, reloadAccounts = () => {}, unit = 'R' }) {
  const [manageOpen, setManageOpen] = useState(false);
  const isGod = accountId === 'all';
  // The box always shows the account's STARTING balance (the dashboard is where
  // the live/current balance lives). God view shows no figure — just a label.
  const startBalance = account?.start_balance ?? ACCOUNT_START;

  return (
    <aside className="sidebar">
      <div className="sb-brand">{BRAND}</div>

      <nav className="sb-nav">
        <div className="sb-section">NAVIGATION</div>
        {NAV.map((item) =>
          item.children
            ? <RailGroup key={item.base} item={item} />
            : <RailLink key={item.to} {...item} />
        )}
      </nav>

      <div className="sb-account">
        <AccountSwitcher accounts={accounts} accountId={accountId} setAccountId={setAccountId} onManage={() => setManageOpen(true)} />
        {!isGod && (
          <div className="sb-balance">
            <span className="sb-balance-val">{fmtMoney(startBalance)}</span>
            <span className="sb-balance-tag" title="Starting balance — the dashboard shows the current balance">start</span>
          </div>
        )}
      </div>

      {manageOpen && (
        <AccountsModal
          accounts={accounts}
          onClose={() => setManageOpen(false)}
          onChanged={reloadAccounts}
        />
      )}
    </aside>
  );
}
