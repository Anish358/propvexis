import React, { useEffect, useMemo, useState } from 'react';
// PHASE 4b — on the shared Modal shell. This was one of the two modals that DID handle
// Escape and DID declare role="dialog", so what it gains is the other four: aria-modal,
// a focus trap, focus return to the opener, and a scroll lock. It also stops being one
// of the four that rendered in place instead of through a portal. Content is untouched;
// its `saving` guard moved from the keydown handler onto the shell's onClose, which
// covers Escape and outside-click together — the two paths it used to guard separately.
import { Modal } from '@/components/primitives';
import { fmtVal, tradeOutcome, valueField } from './metrics.js';
import { slug, fmtTime } from './constants.js';
import { dayTitle } from './dayStats.js';

// "+ Journal" for one day: write the note on every trade of that session in one
// pass, without opening and closing a modal per trade.
//
// It writes the SAME field the trade log's Notes column and the preview panel read
// (`comments`, via the existing partial PATCH) — so this is a faster way into
// journalling that already works, not a parallel store that would need a migration
// and would then disagree with the rest of the app.
//
// Only changed notes are sent. Saving all of them every time would mark untouched
// trades as tagged and bump their updated_at for no reason.

export default function DayJournalModal({ day, unit = 'R', beRounding = false, onClose, onSave }) {
  const field = valueField(unit);
  const trades = day?.trades || [];

  // Draft notes keyed by trade id, seeded from what's stored. Re-seeded when the
  // day changes, not on every render, so typing isn't fighting the props.
  const initial = useMemo(
    () => Object.fromEntries(trades.map((t) => [t.id, t.comments || ''])),
    [day?.key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [draft, setDraft] = useState(initial);
  useEffect(() => { setDraft(initial); }, [initial]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!day) return null;

  const changed = trades.filter((t) => (draft[t.id] ?? '') !== (t.comments || ''));

  async function save() {
    if (!changed.length) { onClose(); return; }
    setSaving(true);
    setError(null);
    // One request per changed note; allSettled so a single failure doesn't discard
    // the notes that did save, and the user is told how many didn't.
    const results = await Promise.allSettled(
      changed.map((t) => onSave(t.id, { comments: draft[t.id].trim() || null })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    setSaving(false);
    if (failed) setError(`${failed} of ${changed.length} notes didn't save. The rest were kept.`);
    else onClose();
  }

  return (
    <Modal
      onClose={() => !saving && onClose()}
      className="dj-modal"
      label={`Journal for ${dayTitle(day.key)}`}
    >
        <header className="dj-head">
          <div>
            <h2 className="dj-title">Journal</h2>
            <span className="dj-sub">{dayTitle(day.key)}</span>
          </div>
          <button type="button" className="dj-x" onClick={onClose} disabled={saving} aria-label="Close">✕</button>
        </header>

        <div className="dj-body">
          {trades.length === 0 && <p className="dj-empty">No trades on this day to journal.</p>}
          {trades.map((t) => {
            const out = tradeOutcome(t, unit, beRounding);
            return (
              <div className="dj-trade" key={t.id}>
                <div className="dj-trade-head">
                  <span className="dj-time">{fmtTime(t.close_time)}</span>
                  <span className={`pill pair-${slug(t.symbol_base || t.symbol)}`}>{t.symbol_base || t.symbol}</span>
                  {t.setup && <span className={`pill setup-${slug(t.setup)}`}>{t.setup}</span>}
                  <span className={`dj-result ${out === 'win' ? 'pos' : out === 'loss' ? 'neg' : ''}`}>
                    {fmtVal(t[field], unit)}
                  </span>
                </div>
                <textarea
                  className="u-textarea dj-note"
                  rows={2}
                  placeholder="What did you see? What would you repeat or avoid?"
                  value={draft[t.id] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>

        <footer className="dj-foot">
          {error && <span className="dj-error" role="alert">{error}</span>}
          {!error && (
            <span className="dj-status">
              {changed.length === 0 ? 'No changes yet' : `${changed.length} note${changed.length === 1 ? '' : 's'} to save`}
            </span>
          )}
          <button type="button" className="u-btn u-btn--secondary u-btn--sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="u-btn u-btn--primary u-btn--sm" onClick={save} disabled={saving || changed.length === 0}>
            {saving ? 'Saving…' : 'Save notes'}
          </button>
        </footer>
    </Modal>
  );
}
