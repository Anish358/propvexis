import React, { useState } from 'react';
import { Modal } from '@/components/primitives';
import { updateAccount } from './api.js';

// Edit one funded account's payout CYCLE — the small popup behind the Upcoming
// Payouts card's edit button.
//
// Two fields, because a cycle is a length plus a starting point:
//
//   cycle length — how many days between payouts (14 = biweekly, the common
//     prop-firm term and the shipped default).
//   next date — an optional override. Normally blank, and the next date is
//     derived from the last payout (or the challenge start) plus the cycle. The
//     override exists because that derivation is a GUESS at the firm's real
//     schedule: a trader who knows their actual date must be able to say so,
//     otherwise the card is confidently wrong with no way to correct it.
//     Clearing it returns to the derived date.
//
// Writes through the existing PATCH /api/accounts/:id — payout_cycle_days and
// payout_anchor_date are ordinary account columns, so there is no second write
// path to keep in step.

export default function PayoutCycleModal({ row, account, onClose, onSaved }) {
  const [days, setDays] = useState(String(row.cycleDays ?? 14));
  const [anchor, setAnchor] = useState(account?.payout_anchor_date?.slice(0, 10) || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save(e) {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) { setErr('Cycle length must be a whole number of days, at least 1.'); return; }
    setBusy(true); setErr(null);
    try {
      await updateAccount(account.id, {
        payout_cycle_days: n,
        // '' means "no override" — send null so the server clears the column
        // rather than storing an empty string.
        payout_anchor_date: anchor === '' ? null : anchor,
      });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="target-modal" label="Edit payout cycle">
      <div className="modal-head">
        <h3>Payout cycle</h3>
        <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <form className="payout-add" onSubmit={save}>
        <div className="pc-account muted">{row.label}</div>

        <label className="po-field">
          <span>Cycle length (days)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="14"
          />
        </label>

        <label className="po-field">
          <span>Next payout date (optional)</span>
          <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </label>
        <p className="pc-hint muted">
          Leave the date blank to work it out automatically — {days || 14} days after your
          last payout, or after the account started if you haven&apos;t had one yet.
        </p>

        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save cycle'}</button>
        {err && <div className="login-error">{err}</div>}
      </form>
    </Modal>
  );
}
