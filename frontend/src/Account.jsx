import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import AccountsModal from './AccountsModal.jsx';
import PayoutsModal from './PayoutsModal.jsx';
import { fmtMoney } from './metrics.js';

// Account — trading-account management (prop/live accounts and their setup),
// distinct from Settings which holds the USER's own info (IA decision
// 2026-07-14). Bare-bones v1: a scannable list of every account + the existing
// manage/payouts flows (AccountsModal / PayoutsModal) opened from here.

const TYPE_LABEL = { eval: 'Evaluation', funded: 'Funded' };

function AccountCard({ a, onManage }) {
  const archived = a.is_active === false;
  const status = archived ? 'Archived' : a.pending ? 'Pending first trade' : 'Active';
  return (
    <div className={`bd acct-card ${archived ? 'archived' : ''}`}>
      <h3>
        {a.label || `MT5 ${a.mt5_login}`}
        <span className="muted"> · {a.kind === 'manual' ? 'Manual' : 'EA sync'}</span>
      </h3>
      <table>
        <tbody>
          {a.kind !== 'manual' && <tr><td>Login</td><td className="num">{a.mt5_login}</td></tr>}
          <tr><td>Type</td><td className="num">{TYPE_LABEL[a.account_type] || a.account_type || '—'}</td></tr>
          <tr><td>Start balance</td><td className="num">{a.start_balance != null ? fmtMoney(a.start_balance) : '—'}</td></tr>
          {a.balance != null && <tr><td>Balance</td><td className="num">{fmtMoney(a.balance)}</td></tr>}
          <tr><td>Status</td><td className="num">{status}</td></tr>
        </tbody>
      </table>
      <button className="btn settings-btn" onClick={onManage}>Manage →</button>
    </div>
  );
}

export default function Account() {
  const {
    connected, toggleSidebar, accounts = [], reloadAccounts, accountId,
    payouts = [], reloadPayouts,
  } = useOutletContext();
  const [manageOpen, setManageOpen] = useState(false);
  const [payoutsOpen, setPayoutsOpen] = useState(false);

  // Same funded-scope rule as the Dashboard's payout tracker.
  const fundedAccounts = useMemo(() => {
    const funded = accounts.filter((a) => a.account_type === 'funded');
    return accountId === 'all' ? funded : funded.filter((a) => String(a.mt5_login) === String(accountId));
  }, [accounts, accountId]);

  const active = accounts.filter((a) => a.is_active !== false);
  const archived = accounts.filter((a) => a.is_active === false);

  return (
    <div className="page">
      <PageHeader
        title="Account"
        connected={connected}
        onMenu={toggleSidebar}
        right={
          <div className="report-actions">
            {fundedAccounts.length > 0 && (
              <button className="btn" onClick={() => setPayoutsOpen(true)}>Payouts</button>
            )}
            <button className="btn primary" onClick={() => setManageOpen(true)}>Manage accounts</button>
          </div>
        }
      />
      <div className="dashboard">
        {accounts.length === 0 ? (
          <div className="panel coming-soon">
            <h3>No trading accounts yet</h3>
            <p className="muted">Add your first prop or live account to start journaling.</p>
            <button className="btn primary settings-btn" onClick={() => setManageOpen(true)}>Add account</button>
          </div>
        ) : (
          <div className="bd-grid">
            {active.map((a) => <AccountCard key={a.id} a={a} onManage={() => setManageOpen(true)} />)}
          </div>
        )}
        {archived.length > 0 && (
          <div className="panel">
            <h3>Archived</h3>
            <div className="bd-grid">
              {archived.map((a) => <AccountCard key={a.id} a={a} onManage={() => setManageOpen(true)} />)}
            </div>
          </div>
        )}
      </div>

      {manageOpen && (
        <AccountsModal accounts={accounts} onClose={() => setManageOpen(false)} onChanged={reloadAccounts} />
      )}
      {payoutsOpen && (
        <PayoutsModal
          payouts={payouts}
          fundedAccounts={fundedAccounts}
          defaultLogin={accountId === 'all' ? undefined : accountId}
          onClose={() => setPayoutsOpen(false)}
          onChanged={reloadPayouts}
        />
      )}
    </div>
  );
}
