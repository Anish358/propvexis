import React, { useState } from 'react';
// PHASE 4b — on the shared Modal shell. This modal had no Escape, no role, no focus
// trap, no focus return and no scroll lock; all five come from the shell now, and the
// hand-rolled portal is gone with it. Its content below is untouched.
import { Modal } from '@/components/primitives';

const SESSIONS = ['', 'ASIA', 'LDN', 'NY'];

// Manual trade entry. Result is entered directly in R; SL/MFE pips are optional
// (used to derive Max R). Optionally scoped to a manual account for a segregated
// per-account view, else account-less (god view only). Strategy options come from
// the user's live catalog.
export default function AddTradeModal({ onClose, onAdd, strategies = [], manualAccounts = [], defaultAccountId = '' }) {
  const setupOptions = ['', ...strategies.map((s) => s.name)];
  const today = new Date().toISOString().slice(0, 10);
  const [accountId, setAccountId] = useState(defaultAccountId || '');
  const [f, setF] = useState({
    close_date: today, symbol: '', direction: '', fixed_r: '',
    sl_size_pips: '', mfe_pips: '', setup: '', session: '', comments: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (f.fixed_r === '' || Number.isNaN(Number(f.fixed_r))) { setErr('Enter the result in R (e.g. 2 or -1).'); return; }
    setBusy(true);
    setErr(null);
    try {
      await onAdd({
        account_id: accountId === '' ? null : Number(accountId),
        close_time: `${f.close_date}T12:00:00Z`,
        open_time: `${f.close_date}T12:00:00Z`,
        symbol: f.symbol.trim() || 'MANUAL',
        direction: f.direction || null,
        fixed_r: Number(f.fixed_r),
        sl_size_pips: f.sl_size_pips === '' ? null : Number(f.sl_size_pips),
        mfe_pips: f.mfe_pips === '' ? null : Number(f.mfe_pips),
        setup: f.setup || null,
        session: f.session || null,
        comments: f.comments.trim() || null,
      });
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="add-trade-modal" label="Add strategy trade">
        <div className="modal-head">
          <h3>Add strategy trade</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="at-note">
          {accountId === ''
            ? 'Not linked to any account — appears only in the All-accounts (strategy) view.'
            : 'Linked to this manual account — appears in its per-account view and the All-accounts view.'}
        </div>

        <form className="at-form" onSubmit={submit}>
          {manualAccounts.length > 0 && (
            <label>Account
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">No account (all-accounts view)</option>
                {manualAccounts.map((a) => (
                  <option key={a.id} value={String(a.mt5_login)}>{a.label}</option>
                ))}
              </select>
            </label>
          )}
          <label>Date<input type="date" value={f.close_date} onChange={set('close_date')} required /></label>
          <label>Result (R)<input type="number" step="0.01" placeholder="e.g. 2 or -1" value={f.fixed_r} onChange={set('fixed_r')} required /></label>
          <label>Symbol<input placeholder="EURUSD" value={f.symbol} onChange={set('symbol')} /></label>
          <label>Direction
            <select value={f.direction} onChange={set('direction')}>
              <option value="">—</option><option value="buy">Buy</option><option value="sell">Sell</option>
            </select>
          </label>
          <label>Strategy
            <select value={f.setup} onChange={set('setup')}>
              {setupOptions.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
            </select>
          </label>
          <label>Session
            <select value={f.session} onChange={set('session')}>
              {SESSIONS.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
            </select>
          </label>
          <label>SL size (pips)<input type="number" step="0.1" placeholder="optional" value={f.sl_size_pips} onChange={set('sl_size_pips')} /></label>
          <label>MFE (pips)<input type="number" step="0.1" placeholder="optional" value={f.mfe_pips} onChange={set('mfe_pips')} /></label>
          <label className="at-wide">Comments<input placeholder="optional" value={f.comments} onChange={set('comments')} /></label>

          {err && <div className="login-error at-wide">{err}</div>}
          <div className="at-actions at-wide">
            <button type="button" className="at-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add trade'}</button>
          </div>
        </form>
    </Modal>
  );
}
