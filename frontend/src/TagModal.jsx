import React, { useEffect, useState } from 'react';
import { SETUP_OPTIONS, PROBABILITY_OPTIONS, MTF_OPTIONS, fmtDate, fmtNum } from './constants.js';

const EMPTY = { setup: '', probability: '', mtf_phase: '', m15_url: '', h1_url: '', h4_url: '', comments: '' };

export default function TagModal({ trade, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
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
    });
    setError(null);
  }, [trade]);

  if (!trade) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // send only fields with a value; empty strings -> null so they clear
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
      );
      await onSave(trade.id, payload);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Tag trade</h2>
          <button className="x" onClick={onClose}>×</button>
        </header>

        <div className="trade-meta">
          <span><b>{trade.symbol}</b> {trade.direction}</span>
          <span>{fmtDate(trade.close_time)}</span>
          <span>SL {fmtNum(trade.sl_size_pips, 1)}p</span>
          <span>MaxR {fmtNum(trade.max_r)}</span>
          <span className={trade.fixed_r > 0 ? 'win' : trade.fixed_r < 0 ? 'loss' : ''}>
            FixedR {fmtNum(trade.fixed_r)}
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
          <button className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </footer>
      </div>
    </div>
  );
}
