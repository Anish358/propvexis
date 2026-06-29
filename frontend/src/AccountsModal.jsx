import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { createAccount, deleteAccount, INGEST_URL } from './api.js';

// EA setup card shown for an account (token + step-by-step). The MT5 login
// auto-binds from the first trade, so there's nothing to type but the token.
function SetupCard({ account }) {
  const [copied, setCopied] = useState(null);
  const copy = (text, what) => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div className="acct-setup">
      <ol className="acct-steps">
        <li>Attach the <b>AmeyJournal</b> EA to any chart on this MT5 account.</li>
        <li>
          Set <code>InpBackendUrl</code> to:
          <div className="acct-copy">
            <code>{INGEST_URL}</code>
            <button onClick={() => copy(INGEST_URL, 'url')}>{copied === 'url' ? 'Copied' : 'Copy'}</button>
          </div>
        </li>
        <li>
          Set <code>InpIngestToken</code> to:
          <div className="acct-copy">
            <code className="acct-token">{account.ingest_token}</code>
            <button onClick={() => copy(account.ingest_token, 'tok')}>{copied === 'tok' ? 'Copied' : 'Copy'}</button>
          </div>
        </li>
        <li>In MT5: Tools → Options → Expert Advisors → tick <b>Allow WebRequest</b> and add the URL above.</li>
        <li><b>Place your first trade</b> — it auto-links this MT5 account and tracking begins.</li>
      </ol>
    </div>
  );
}

export default function AccountsModal({ accounts = [], onClose, onChanged }) {
  const [label, setLabel] = useState('');
  const [startBalance, setStartBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // freshly created account -> show its setup
  const [openSetupId, setOpenSetupId] = useState(null);
  const [err, setErr] = useState(null);

  async function add(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const acct = await createAccount({
        label: label.trim(),
        start_balance: startBalance === '' ? null : Number(startBalance),
      });
      setCreated(acct);
      setLabel('');
      setStartBalance('');
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this account? Its trades stay but become unlinked.')) return;
    await deleteAccount(id);
    if (created?.id === id) setCreated(null);
    onChanged?.();
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal acct-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>MT5 Accounts</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        {/* existing accounts */}
        <div className="acct-list">
          {accounts.length === 0 && <div className="acct-empty">No accounts yet — add one below.</div>}
          {accounts.map((a) => (
            <div key={a.id} className="acct-row">
              <div className="acct-row-main">
                <div className="acct-row-label">{a.label}</div>
                <div className="acct-row-meta">
                  {a.pending ? (
                    <span className="acct-badge pending">● Waiting for first trade</span>
                  ) : (
                    <span className="acct-badge bound">MT5 {a.mt5_login}</span>
                  )}
                </div>
              </div>
              <div className="acct-row-actions">
                <button onClick={() => setOpenSetupId(openSetupId === a.id ? null : a.id)}>
                  {openSetupId === a.id ? 'Hide setup' : 'Setup'}
                </button>
                <button className="danger" onClick={() => remove(a.id)}>Delete</button>
              </div>
              {openSetupId === a.id && <SetupCard account={a} />}
            </div>
          ))}
        </div>

        {/* freshly created -> highlight its setup */}
        {created && (
          <div className="acct-created">
            <div className="acct-created-head">✓ “{created.label}” created. Finish setup in your EA:</div>
            <SetupCard account={created} />
          </div>
        )}

        {/* add form */}
        <form className="acct-add" onSubmit={add}>
          <div className="acct-add-row">
            <input
              placeholder="Account label (e.g. GFT Challenge #1)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              type="number"
              placeholder="Start balance"
              value={startBalance}
              onChange={(e) => setStartBalance(e.target.value)}
            />
            <button type="submit" disabled={busy || !label.trim()}>{busy ? 'Adding…' : '+ Add account'}</button>
          </div>
          {err && <div className="login-error">{err}</div>}
        </form>
      </div>
    </div>,
    document.body
  );
}
