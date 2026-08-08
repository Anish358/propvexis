import React, { useMemo, useState } from 'react';
// PHASE 4b — on the shared Modal shell. This modal had no Escape, no role, no focus
// trap, no focus return and no scroll lock; all five come from the shell now, and the
// hand-rolled portal is gone with it. Its content below is untouched.
import { Modal } from '@/components/primitives';
import { updateStrategy } from '../../lib/api.js';

const SESSIONS = ['ASIA', 'LDN', 'NY'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Build the editor's form state from a strategy's stored rules array.
function stateFromRules(rules = []) {
  const by = Object.fromEntries((rules || []).map((r) => [r.type, r]));
  return {
    session: { on: !!by.session, values: by.session?.values || [] },
    direction: { on: !!by.direction, value: by.direction?.value || 'buy' },
    max_sl: { on: !!by.max_sl, value: by.max_sl?.value ?? '' },
    symbols: { on: !!by.symbols, text: (by.symbols?.values || []).join(', ') },
    weekdays: { on: !!by.weekdays, values: by.weekdays?.values || [] },
  };
}

// Collect enabled sections back into a rules array (server sanitizes again).
function rulesFromState(s) {
  const rules = [];
  if (s.session.on && s.session.values.length) rules.push({ type: 'session', values: s.session.values });
  if (s.direction.on) rules.push({ type: 'direction', value: s.direction.value });
  if (s.max_sl.on && s.max_sl.value !== '') rules.push({ type: 'max_sl', value: Number(s.max_sl.value) });
  if (s.symbols.on) {
    const values = s.symbols.text.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
    if (values.length) rules.push({ type: 'symbols', values });
  }
  if (s.weekdays.on && s.weekdays.values.length) rules.push({ type: 'weekdays', values: s.weekdays.values });
  return rules;
}

// Small chip multi-select.
function Chips({ options, selected, onToggle }) {
  return (
    <div className="rule-chips">
      {options.map((o) => (
        <button type="button" key={o}
          className={`rule-chip ${selected.includes(o) ? 'on' : ''}`}
          onClick={() => onToggle(o)}>{o}</button>
      ))}
    </div>
  );
}

export default function StrategyRulesModal({ strategy, onClose, onSaved }) {
  const [s, setS] = useState(() => stateFromRules(strategy.rules));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const patch = (key, upd) => setS((prev) => ({ ...prev, [key]: { ...prev[key], ...upd } }));
  const toggleVal = (key, v) => setS((prev) => {
    const cur = prev[key].values;
    return { ...prev, [key]: { ...prev[key], values: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } };
  });

  const ruleCount = useMemo(() => rulesFromState(s).length, [s]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await updateStrategy(strategy.id, { rules: rulesFromState(s) });
      await onSaved?.();
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const Section = ({ id, title, children }) => (
    <div className={`rule-sec ${s[id].on ? 'on' : ''}`}>
      <label className="rule-sec-head">
        <input type="checkbox" checked={s[id].on} onChange={(e) => patch(id, { on: e.target.checked })} />
        <span>{title}</span>
      </label>
      {s[id].on && <div className="rule-sec-body">{children}</div>}
    </div>
  );

  return (
    <Modal onClose={onClose} className="rules-modal" label={`Rules — ${strategy.name}`}>
        <div className="modal-head">
          <h3>Rules — {strategy.name}</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="at-note">
          Trades are checked against these automatically from your MT5 data. A trade
          <b> follows</b> the strategy when every applicable rule passes, and <b>breaks</b> it otherwise.
        </div>

        <div className="rules-body">
          <Section id="session" title="Allowed sessions">
            <Chips options={SESSIONS} selected={s.session.values} onToggle={(v) => toggleVal('session', v)} />
          </Section>

          <Section id="direction" title="Direction only">
            <div className="rule-radios">
              {['buy', 'sell'].map((d) => (
                <label key={d}><input type="radio" name="dir" checked={s.direction.value === d}
                  onChange={() => patch('direction', { value: d })} /> {d}</label>
              ))}
            </div>
          </Section>

          <Section id="max_sl" title="Max SL size (pips)">
            <input type="number" min="0" step="0.1" className="rule-num" value={s.max_sl.value}
              onChange={(e) => patch('max_sl', { value: e.target.value })} placeholder="e.g. 15" />
          </Section>

          <Section id="symbols" title="Allowed symbols">
            <input className="rule-text" value={s.symbols.text}
              onChange={(e) => patch('symbols', { text: e.target.value })} placeholder="EURUSD, GBPUSD, XAUUSD" />
          </Section>

          <Section id="weekdays" title="Allowed weekdays">
            <Chips options={DAYS} selected={s.weekdays.values} onToggle={(v) => toggleVal('weekdays', v)} />
          </Section>
        </div>

        {err && <div className="login-error">{err}</div>}
        <div className="at-actions">
          <span className="rules-count">{ruleCount} rule{ruleCount === 1 ? '' : 's'}</span>
          <button type="button" className="at-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save rules'}</button>
        </div>
    </Modal>
  );
}
