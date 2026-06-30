import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ACCOUNT_START, fmtMoney, fmtVal, valueField } from './metrics.js';
import { useAuth } from './AuthContext.jsx';
import AccountsModal from './AccountsModal.jsx';

const GOD = 'all';
const acctLabel = (a) => a.label || `MT5 ${a.mt5_login}`;

// Account selector: "All accounts (God)" + each BOUND account, plus a
// "Manage accounts" entry. Pending accounts (no trades yet) live in the modal.
function AccountSwitcher({ accounts = [], accountId, setAccountId, onManage }) {
  const [open, setOpen] = useState(false);
  const bound = accounts.filter((a) => !a.pending);
  const pendingCount = accounts.length - bound.length;
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
              {acctLabel(a)} <span className="acct-opt-sub">{a.mt5_login}</span>
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

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconLog = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    <path d="M8 13h8M8 17h8M8 9h2" />
  </svg>
);
const IconAnalytics = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" />
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const NAV = [
  { to: '/', label: 'Dashboard', Icon: IconDashboard, end: true },
  { to: '/trades', label: 'Trade Log', Icon: IconLog },
  { to: '/analytics', label: 'Analytics', Icon: IconAnalytics },
  { to: '/calendar', label: 'Calendar', Icon: IconCalendar },
];

export default function Sidebar({ trades = [], account = null, accounts = [], accountId = 'all', setAccountId = () => {}, reloadAccounts = () => {}, unit = 'R' }) {
  const { user, logout } = useAuth();
  const [manageOpen, setManageOpen] = useState(false);
  // Total in the active unit: R across all accounts, account currency per account.
  const field = valueField(unit);
  const total = trades.reduce((a, t) => a + Number(t[field] ?? 0), 0);
  const isGod = accountId === 'all';
  // The box always shows the account's STARTING balance (the dashboard is where
  // the live/current balance lives). God view shows no figure — just a label.
  const startBalance = account?.start_balance ?? ACCOUNT_START;

  return (
    <aside className="sidebar">
      <div className="sb-brand">PATIL TRADES</div>

      <nav className="sb-nav">
        <div className="sb-section">NAVIGATION</div>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}>
            <Icon /><span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sb-account">
        <AccountSwitcher accounts={accounts} accountId={accountId} setAccountId={setAccountId} onManage={() => setManageOpen(true)} />
        <div className="sb-account-label">
          {isGod ? '' : 'ACCOUNT'}
          {!isGod && <span className="sb-account-tag" title="Starting balance — see the dashboard for the current balance">START</span>}
        </div>
        {isGod ? (
          <div className="sb-account-balance god"></div>
        ) : (
          <div className="sb-account-balance">{fmtMoney(startBalance)}</div>
        )}
      </div>

      {user && (
        <div className="sb-user">
          {user.picture && <img className="sb-user-pic" src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <div className="sb-user-meta">
            <div className="sb-user-name">{user.name || user.email}</div>
            <div className="sb-user-email">{user.email}</div>
          </div>
          <button className="sb-logout" onClick={logout} title="Sign out">Sign out</button>
        </div>
      )}

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
