import React, { useMemo, useState } from 'react';
// PHASE 4b — on the shared Modal shell. This modal had no Escape, no role, no focus
// trap, no focus return and no scroll lock; all five come from the shell now, and the
// hand-rolled portal is gone with it. Its content below is untouched.
import { Modal } from '@/components/primitives';
import { createPayout, deletePayout } from '../../lib/api.js';
import { fmtMoney } from '../../lib/metrics.js';

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

// Record + manage profit withdrawals for funded accounts. `fundedAccounts` are
// the funded accounts in scope; when there's more than one the add form shows an
// account picker. `payouts` is the scope's payout list (already fetched by App).
export default function PayoutsModal({ payouts = [], fundedAccounts = [], defaultLogin, onClose, onChanged }) {
  const initialLogin = defaultLogin && fundedAccounts.some((a) => String(a.mt5_login) === String(defaultLogin))
    ? String(defaultLogin)
    : (fundedAccounts[0] ? String(fundedAccounts[0].mt5_login) : '');
  const [login, setLogin] = useState(initialLogin);
  const [date, setDate] = useState(todayInput());
  const [gross, setGross] = useState('');
  const [split, setSplit] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const acct = fundedAccounts.find((a) => String(a.mt5_login) === String(login));
  // Split defaults to the selected account's configured share when left blank.
  const effSplit = split === '' ? Number(acct?.payout_split_pct ?? 80) : Number(split);
  const grossNum = Number(gross);
  const preview = grossNum > 0 && effSplit >= 0 ? (grossNum * effSplit) / 100 : null;

  const total = useMemo(() => payouts.reduce((s, p) => s + (Number(p.trader_amount) || 0), 0), [payouts]);
  const totalGross = useMemo(() => payouts.reduce((s, p) => s + (Number(p.gross_amount) || 0), 0), [payouts]);

  async function add(e) {
    e.preventDefault();
    if (!login) { setErr('Add a funded account first.'); return; }
    if (!(grossNum > 0)) { setErr('Enter a withdrawal amount.'); return; }
    setBusy(true); setErr(null);
    try {
      await createPayout({
        account_id: Number(login),
        payout_date: new Date(date).toISOString(),
        gross_amount: grossNum,
        split_pct: split === '' ? undefined : effSplit,
      });
      setGross(''); setSplit('');
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this payout?')) return;
    await deletePayout(id);
    onChanged?.();
  }

  const acctLabel = (lg) => {
    const a = fundedAccounts.find((x) => String(x.mt5_login) === String(lg));
    return a ? (a.label || `MT5 ${a.mt5_login}`) : `MT5 ${lg}`;
  };
  const multi = fundedAccounts.length > 1;

  return (
    <Modal onClose={onClose} className="payouts-modal" label="Payouts">
        <div className="modal-head">
          <h3>Payouts</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        <div className="payout-totals">
          <div><span className="po-total-label">Total to trader</span><span className="po-total-val win">{fmtMoney(total)}</span></div>
          <div><span className="po-total-label">Gross withdrawn</span><span className="po-total-val">{fmtMoney(totalGross)}</span></div>
        </div>

        {fundedAccounts.length === 0 ? (
          <div className="acct-empty" style={{ padding: '0 20px 12px' }}>
            No funded accounts. Set an account’s type to <b>Funded</b> in Manage accounts to track payouts.
          </div>
        ) : (
          <form className="payout-add" onSubmit={add}>
            {multi && (
              <label className="po-field">
                <span>Account</span>
                <select value={login} onChange={(e) => setLogin(e.target.value)}>
                  {fundedAccounts.map((a) => (
                    <option key={a.id} value={String(a.mt5_login)}>{a.label || `MT5 ${a.mt5_login}`}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="po-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="po-field">
              <span>Withdrawal ($ gross)</span>
              <input type="number" step="0.01" min="0" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="10000" />
            </label>
            <label className="po-field">
              <span>Split % (trader)</span>
              <input type="number" step="1" min="0" max="100" value={split} onChange={(e) => setSplit(e.target.value)} placeholder={String(acct?.payout_split_pct ?? 80)} />
            </label>
            <div className="po-preview">
              {preview != null ? <>Trader receives <b>{fmtMoney(preview)}</b> at {effSplit}%</> : <span className="muted">Enter an amount to see the split</span>}
            </div>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : '+ Record payout'}</button>
            {err && <div className="login-error">{err}</div>}
          </form>
        )}

        <div className="payout-list">
          {payouts.length === 0 && <div className="acct-empty">No payouts recorded yet.</div>}
          {payouts.map((p) => (
            <div key={p.id} className="payout-row">
              <div className="po-row-date">{fmtDay(p.payout_date)}</div>
              <div className="po-row-amounts">
                <span className="po-gross">{fmtMoney(p.gross_amount)}</span>
                <span className="po-arrow">→</span>
                <span className="po-net win">{fmtMoney(p.trader_amount)}</span>
                <span className="po-split">{p.split_pct}%</span>
                {multi && <span className="po-acct">{acctLabel(p.account_id)}</span>}
                {p.source === 'ea' && <span className="po-src" title="Auto-detected from MT5">auto</span>}
              </div>
              <button className="po-del" title="Delete payout" onClick={() => remove(p.id)}>✕</button>
            </div>
          ))}
        </div>
    </Modal>
  );
}
