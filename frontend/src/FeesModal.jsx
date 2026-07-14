import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createFee, deleteFee } from './api.js';
import { fmtMoney } from './metrics.js';

// Local date (yyyy-mm-dd) for the date input default — avoids UTC off-by-one.
function todayInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fmtDay = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

const FEE_TYPES = [
  { id: 'evaluation', label: 'Evaluation fee' },
  { id: 'reset', label: 'Reset' },
  { id: 'activation', label: 'Activation fee' },
  { id: 'other', label: 'Other' },
];
const feeLabel = (id) => FEE_TYPES.find((t) => t.id === id)?.label || id;

// Record + manage prop-firm fees (money OUT), the mirror of PayoutsModal. Unlike
// payouts, fees apply to ANY account (an eval fee is paid before you're funded),
// so the picker lists all in-scope accounts. `fees` is fetched by App.
export default function FeesModal({ fees = [], accounts = [], defaultLogin, onClose, onChanged }) {
  const initialLogin = defaultLogin && accounts.some((a) => String(a.mt5_login) === String(defaultLogin))
    ? String(defaultLogin)
    : (accounts[0] ? String(accounts[0].mt5_login) : '');
  const [login, setLogin] = useState(initialLogin);
  const [date, setDate] = useState(todayInput());
  const [amount, setAmount] = useState('');
  const [feeType, setFeeType] = useState('evaluation');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const amountNum = Number(amount);
  const total = useMemo(() => fees.reduce((s, f) => s + (Number(f.amount) || 0), 0), [fees]);

  async function add(e) {
    e.preventDefault();
    if (!login) { setErr('Add an account first.'); return; }
    if (!(amountNum > 0)) { setErr('Enter a fee amount.'); return; }
    setBusy(true); setErr(null);
    try {
      await createFee({
        account_id: Number(login),
        fee_date: new Date(date).toISOString(),
        amount: amountNum,
        fee_type: feeType,
      });
      setAmount('');
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this fee?')) return;
    await deleteFee(id);
    onChanged?.();
  }

  const acctLabel = (lg) => {
    const a = accounts.find((x) => String(x.mt5_login) === String(lg));
    return a ? (a.label || `MT5 ${a.mt5_login}`) : `MT5 ${lg}`;
  };
  const multi = accounts.length > 1;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal payouts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Fees &amp; Expenses</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="payout-totals">
          <div><span className="po-total-label">Total spent</span><span className="po-total-val loss">{fmtMoney(total)}</span></div>
        </div>

        {accounts.length === 0 ? (
          <div className="acct-empty" style={{ padding: '0 20px 12px' }}>
            No accounts yet — add one in Manage accounts to track its fees.
          </div>
        ) : (
          <form className="payout-add" onSubmit={add}>
            {multi && (
              <label className="po-field">
                <span>Account</span>
                <select value={login} onChange={(e) => setLogin(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.mt5_login)}>{a.label || `MT5 ${a.mt5_login}`}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="po-field">
              <span>Type</span>
              <select value={feeType} onChange={(e) => setFeeType(e.target.value)}>
                {FEE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="po-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="po-field">
              <span>Amount ($)</span>
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200" />
            </label>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : '+ Record fee'}</button>
            {err && <div className="login-error">{err}</div>}
          </form>
        )}

        <div className="payout-list">
          {fees.length === 0 && <div className="acct-empty">No fees recorded yet.</div>}
          {fees.map((f) => (
            <div key={f.id} className="payout-row">
              <div className="po-row-date">{fmtDay(f.fee_date)}</div>
              <div className="po-row-amounts">
                <span className="po-net loss">{fmtMoney(f.amount)}</span>
                <span className="po-split">{feeLabel(f.fee_type)}</span>
                {multi && <span className="po-acct">{acctLabel(f.account_id)}</span>}
                {f.source === 'ea' && <span className="po-src" title="Auto-detected">auto</span>}
              </div>
              <button className="po-del" title="Delete fee" onClick={() => remove(f.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
