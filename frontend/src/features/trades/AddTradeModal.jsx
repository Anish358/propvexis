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
//
// IT IS "ADD TRADE", NOT "ADD STRATEGY TRADE" (owner decision 2026-08-27). The old name
// described the account-less case — a trade with no account exists only in the
// all-accounts view, which the app calls the strategy view — but the modal serves BOTH
// cases and the Account field above is what says which one this is. Two names for one
// action, differing by a field the user has not filled in yet, is a name that reads as
// two features. The Trade Log's button lost the same split.
//
// AND THE NOTE UNDER THE TITLE IS GONE with it (same pass, same reason the wizard's
// explanation text went): it restated the Account select in a sentence, directly above
// the select itself.
//
// P&L IS COLLECTED TOO, and the server has always accepted it — POST /api/trades reads
// `pnl_money` and stores it nullable, so this field is the client half of a column that
// existed with nothing to fill it. It matters because the two units are not derivable
// from each other: the journal is R-based in the god view (`fixed_r`) and DOLLAR-based
// per account (`pnl_money`), and a manual trade with no money figure showed as $0 on
// every single-account surface. R stays REQUIRED — it is what every R-based aggregate is
// computed from, and the route rejects a trade without it.
export default function AddTradeModal({ onClose, onAdd, strategies = [], manualAccounts = [], defaultAccountId = '' }) {
  const setupOptions = ['', ...strategies.map((s) => s.name)];
  const today = new Date().toISOString().slice(0, 10);
  const [accountId, setAccountId] = useState(defaultAccountId || '');
  const [f, setF] = useState({
    close_date: today, symbol: '', direction: '', fixed_r: '', pnl_money: '',
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
        // Blank means NULL, not 0 — the same distinction numOrNull draws server-side, and
        // the reason a plain `Number('')` (which is 0) would be wrong here: it would file
        // every trade whose P&L was not recorded as a breakeven.
        pnl_money: f.pnl_money === '' ? null : Number(f.pnl_money),
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
    <Modal onClose={onClose} className="add-trade-modal" label="Add trade">
        <div className="modal-head">
          <h3>Add trade</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
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
          {/* Optional, and NOT derived from R: the two are independent facts about the
              same trade, and inferring one from the other would need a risk-per-trade
              figure this modal never asks for. Left blank it stays NULL rather than 0 —
              "not recorded" and "broke even" are different trades. `step="0.01"` because
              a P&L is cents, and the sign carries the direction of the result. */}
          <label>P&amp;L ($)<input type="number" step="0.01" placeholder="optional, e.g. 250 or -120" value={f.pnl_money} onChange={set('pnl_money')} /></label>
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
