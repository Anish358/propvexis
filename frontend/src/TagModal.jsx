import React, { useEffect, useState } from 'react';
import { SETUP_OPTIONS, PROBABILITY_OPTIONS, MTF_OPTIONS, fmtDateTime, fmtNum } from './constants.js';

const TAG_KEYS = ['setup', 'probability', 'mtf_phase', 'm15_url', 'h1_url', 'h4_url', 'comments'];
const METRIC_KEYS = ['sl_size_pips', 'mfe_pips'];
const EMPTY = { setup: '', probability: '', mtf_phase: '', m15_url: '', h1_url: '', h4_url: '', comments: '', sl_size_pips: '', mfe_pips: '' };

// stringify a DB value for an input (null -> '')
const s = (v) => (v == null ? '' : String(v));

export default function TagModal({ trade, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!trade) return;
    setForm({
      setup: trade.setup || '',
      probability: trade.probability || '',
      mtf_phase: trade.mtf_phase || '',
      m15_url: trade.m15_url || '',
      h1_url: trade.h1_url || '',
      h4_url: trade.h4_url || '',
      comments: trade.comments || '',
      sl_size_pips: s(trade.sl_size_pips),
      mfe_pips: s(trade.mfe_pips),
    });
    setError(null);
    setConfirmDelete(false);
    // Reset transient flags — otherwise a successful delete leaves `deleting`
    // true (remove() only clears it on error), disabling delete for the next trade.
    setDeleting(false);
    setSaving(false);
  }, [trade]);

  if (!trade) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // tags: always sent (empty string -> null clears the field)
      const payload = {};
      for (const k of TAG_KEYS) payload[k] = form[k] === '' ? null : form[k];
      // metrics: sent only when changed, so tag-only edits don't recompute Max R
      for (const k of METRIC_KEYS) {
        if (form[k] !== s(trade[k])) payload[k] = form[k] === '' ? null : Number(form[k]);
      }
      await onSave(trade.id, payload);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(trade.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  const sl = Number(form.sl_size_pips);
  const mfe = Number(form.mfe_pips);
  const maxRPreview = form.sl_size_pips !== '' && form.mfe_pips !== '' && sl > 0
    ? (Math.round((mfe / sl) * 100) / 100).toFixed(2)
    : '—';
  // Fixed R scales inversely with SL size (the realized reward in pips is fixed,
  // only the risk denominator moves). For price-derived (EA/import) trades, show
  // a live preview as the user edits SL; the backend recomputes the same on save.
  const canScaleFixedR = trade.source !== 'manual' && trade.fixed_r != null && Number(trade.sl_size_pips) > 0;
  const fixedRPreview = canScaleFixedR && sl > 0
    ? Math.round((Number(trade.fixed_r) * Number(trade.sl_size_pips) / sl) * 100) / 100
    : trade.fixed_r;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Edit trade</h2>
          <button className="x" onClick={onClose}>×</button>
        </header>

        <div className="trade-meta">
          <span><b>{trade.symbol}</b> {trade.direction}</span>
          <span>{fmtDateTime(trade.close_time)}</span>
          <span>SL {fmtNum(trade.sl_size_pips, 1)}p</span>
          <span>MaxR {maxRPreview}</span>
          <span className={fixedRPreview > 0 ? 'win' : fixedRPreview < 0 ? 'loss' : ''}>
            FixedR {fmtNum(fixedRPreview)}
          </span>
        </div>

        <div className="field-row">
          <label>
            Setup
            <select value={form.setup} onChange={set('setup')}>
              <option value="">—</option>
              {SETUP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label>
            Probability
            <select value={form.probability} onChange={set('probability')}>
              <option value="">—</option>
              {PROBABILITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label>
            MTF Phase
            <select value={form.mtf_phase} onChange={set('mtf_phase')}>
              <option value="">—</option>
              {MTF_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>

        <div className="field-row">
          <label>
            SL Size (pips)
            <input type="number" min="0" step="0.1" value={form.sl_size_pips} onChange={set('sl_size_pips')} placeholder="—" />
          </label>
          <label>
            MFE (pips)
            <input type="number" min="0" step="0.1" value={form.mfe_pips} onChange={set('mfe_pips')} placeholder="—" />
          </label>
          <label>
            Max R <span className="auto-hint">auto</span>
            <input value={maxRPreview} readOnly disabled />
          </label>
        </div>

        <div className="field-row">
          <label>M15 link<input value={form.m15_url} onChange={set('m15_url')} placeholder="https://…" /></label>
          <label>H1 link<input value={form.h1_url} onChange={set('h1_url')} placeholder="https://…" /></label>
          <label>H4 link<input value={form.h4_url} onChange={set('h4_url')} placeholder="https://…" /></label>
        </div>

        <label className="full">
          Comments
          <textarea rows={3} value={form.comments} onChange={set('comments')} placeholder="e.g. SL sweep by 1 pip" />
        </label>

        {error && <p className="error">{error}</p>}

        <footer>
          {onDelete && (
            confirmDelete ? (
              <div className="delete-confirm">
                <span>Delete this trade?</span>
                <button className="danger" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes, delete'}</button>
                <button className="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>No</button>
              </div>
            ) : (
              <button className="danger-link" onClick={() => setConfirmDelete(true)} disabled={saving || deleting}>Delete</button>
            )
          )}
          <span className="footer-spacer" />
          <button className="secondary" onClick={onClose} disabled={saving || deleting}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving || deleting}>{saving ? 'Saving…' : 'Save'}</button>
        </footer>
      </div>
    </div>
  );
}
