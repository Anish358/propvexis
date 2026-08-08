import React, { useEffect, useRef, useState } from 'react';
import { PROBABILITY_OPTIONS } from '../../lib/constants.js';

// Bulk actions for the selected trade rows.
//
// Disabled with nothing selected — a menu whose every item would be a no-op is
// worse than a dead button, because it invites a click and then explains itself.
// The count is in the label, so the button says what it will act on.
//
// The two field actions exist because the log's own "N to tag" nudge is the most
// common reason to select several rows at once: same strategy, same read, one pass.
// They expand inline rather than opening a flyout — one column of choices, no
// second menu to position or dismiss.

const Chevron = ({ open }) => (
  <svg className={`bulk-chev ${open ? 'is-open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

export default function BulkActions({
  count = 0, strategies = [], busy = false,
  onSetField = () => {}, onExport = () => {}, onDelete = () => {},
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(null); // 'setup' | 'probability' | null
  const ref = useRef(null);
  const disabled = count === 0 || busy;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Losing the selection mid-menu (a filter change, a delete) leaves the menu
  // pointing at nothing, so close it rather than let it act on an empty set.
  useEffect(() => { if (disabled) { setOpen(false); setSection(null); } }, [disabled]);

  const run = (fn) => { setOpen(false); setSection(null); fn(); };
  const strategyNames = strategies.map((s) => s.name).filter(Boolean);

  return (
    <div className="bulk" ref={ref}>
      <button
        type="button"
        className={`bulk-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={count === 0 ? 'Select trades to enable bulk actions' : `Bulk actions for ${count} selected`}
      >
        {busy ? 'Working…' : `Bulk actions${count ? ` (${count})` : ''}`}
        <Chevron open={open} />
      </button>

      {open && (
        <div className="bulk-menu" role="menu">
          <button
            type="button"
            className={`bulk-item ${section === 'setup' ? 'is-open' : ''}`}
            onClick={() => setSection((s) => (s === 'setup' ? null : 'setup'))}
            aria-expanded={section === 'setup'}
          >
            Set strategy<Chevron open={section === 'setup'} />
          </button>
          {section === 'setup' && (
            <div className="bulk-sub">
              {strategyNames.length === 0 && <span className="bulk-empty">No strategies yet — add one on the Strategies page.</span>}
              {strategyNames.map((name) => (
                <button key={name} type="button" className="bulk-sub-item" onClick={() => run(() => onSetField('setup', name))}>
                  {name}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className={`bulk-item ${section === 'probability' ? 'is-open' : ''}`}
            onClick={() => setSection((s) => (s === 'probability' ? null : 'probability'))}
            aria-expanded={section === 'probability'}
          >
            Set probability<Chevron open={section === 'probability'} />
          </button>
          {section === 'probability' && (
            <div className="bulk-sub">
              {PROBABILITY_OPTIONS.map((p) => (
                <button key={p} type="button" className="bulk-sub-item" onClick={() => run(() => onSetField('probability', p))}>
                  {p}
                </button>
              ))}
            </div>
          )}

          <div className="bulk-sep" />
          <button type="button" className="bulk-item" onClick={() => run(onExport)}>Export CSV</button>
          <button type="button" className="bulk-item bulk-item--danger" onClick={() => run(onDelete)}>
            Delete {count} trade{count === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}
