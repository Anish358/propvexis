import React, { useEffect, useRef } from 'react';
import {
  BRIEF_SECTIONS, BRIEF_IMPORTANCE, BRIEF_CURRENCIES, BRIEF_WINDOWS, BRIEF_TIMEZONES,
  isDefaultBriefPrefs,
} from './briefPrefs.js';

// Today's Brief preference popover — anchored to the banner's gear, not a modal.
// It configures the Today's Brief widget ONLY: which of its sections show, and
// how its event list is filtered/formatted. Dashboard layout, KPI cards, themes
// and account settings are deliberately absent — those live elsewhere.
//
// Closes on outside mousedown (same pattern as the account overflow menu) and on
// Escape. Every change writes straight through to the persisted prefs, so there
// is no Save button — the panel is a live control surface, not a form.

function CheckRow({ id, label, checked, onChange, soon = false }) {
  return (
    <label className={`bs-opt ${soon ? 'bs-opt--soon' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={soon}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="bs-opt-label">{label}</span>
      {soon && <span className="bs-soon-tag">Soon</span>}
    </label>
  );
}

function RadioRow({ name, value, current, label, onChange }) {
  return (
    <label className="bs-opt">
      <input
        type="radio"
        name={name}
        checked={current === value}
        onChange={() => onChange(value)}
      />
      <span className="bs-opt-label">{label}</span>
    </label>
  );
}

export default function BriefSettingsPopover({
  open, onClose, prefs, patchBriefPrefs, setBriefSection, resetBriefPrefs,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const patch = patchBriefPrefs || (() => {});
  const toggleSection = setBriefSection || (() => {});

  const toggleCurrency = (code, on) => {
    const next = on
      ? [...prefs.currencies, code]
      : prefs.currencies.filter((c) => c !== code);
    // Keep the stored order canonical so two users who picked the same set have
    // identical blobs (and isDefaultBriefPrefs can compare positionally).
    patch({ currencies: BRIEF_CURRENCIES.filter((c) => next.includes(c)) });
  };

  return (
    <div className="bs-pop" ref={ref} role="dialog" aria-label="Today's Brief settings">
      <div className="bs-pop-head">
        <span className="bs-pop-title">Brief settings</span>
        <button type="button" className="bs-pop-x" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="bs-pop-body">
        {/* 1. Sections */}
        <div className="bs-group">
          <div className="bs-group-label">Sections</div>
          {BRIEF_SECTIONS.map((s) => (
            <CheckRow
              key={s.id}
              id={s.id}
              label={s.label}
              soon={s.soon}
              checked={!!prefs.sections[s.id]}
              onChange={(v) => toggleSection(s.id, v)}
            />
          ))}
        </div>

        {/* 2. News importance */}
        <div className="bs-group">
          <div className="bs-group-label">News importance</div>
          {BRIEF_IMPORTANCE.map((i) => (
            <RadioRow
              key={i.id}
              name="bs-importance"
              value={i.id}
              current={prefs.importance}
              label={i.label}
              onChange={(v) => patch({ importance: v })}
            />
          ))}
        </div>

        {/* 3. Currencies */}
        <div className="bs-group">
          <div className="bs-group-label">
            Currencies
            <span className="bs-quick">
              <button type="button" onClick={() => patch({ currencies: [...BRIEF_CURRENCIES] })}>Select all</button>
              <button type="button" onClick={() => patch({ currencies: [] })}>Clear all</button>
            </span>
          </div>
          {/* Two columns on a roomy panel — 9 currencies stacked would dominate
              the popover's height. Collapses to one at narrow widths. */}
          <div className="bs-ccy-grid">
            {BRIEF_CURRENCIES.map((c) => (
              <CheckRow
                key={c}
                id={c}
                label={c}
                checked={prefs.currencies.includes(c)}
                onChange={(v) => toggleCurrency(c, v)}
              />
            ))}
          </div>
          {prefs.currencies.length === 0 && (
            <p className="bs-note">No currencies selected — the events list will be empty.</p>
          )}
        </div>

        {/* 4. Time window */}
        <div className="bs-group">
          <div className="bs-group-label">Time window</div>
          {BRIEF_WINDOWS.map((w) => (
            <RadioRow
              key={w.id}
              name="bs-window"
              value={w.id}
              current={prefs.window}
              label={w.label}
              onChange={(v) => patch({ window: v })}
            />
          ))}
        </div>

        {/* 5. Timezone */}
        <div className="bs-group">
          <div className="bs-group-label">Timezone</div>
          <select
            className="bs-select"
            value={prefs.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
            aria-label="Timezone"
          >
            {BRIEF_TIMEZONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        {/* 6. Display options */}
        {/* "Hide empty sections" IS GONE (2026-08-30). Both brief columns render on
            their own toggle now and show an empty state instead of disappearing — a
            column that vanishes hands the whole card to its neighbour and gives the
            trader no way to tell "empty" from "broken". With nothing left for the
            checkbox to do, keeping it would be a control the product cannot honour,
            which §2 rules out more firmly than it rules out removing one. The section
            toggles above are still the way to hide a column. */}
      </div>

      {/* 7. Reset */}
      <div className="bs-pop-foot">
        <button
          type="button"
          className="bs-reset"
          onClick={resetBriefPrefs}
          disabled={isDefaultBriefPrefs(prefs)}
        >
          Restore defaults
        </button>
      </div>
    </div>
  );
}
