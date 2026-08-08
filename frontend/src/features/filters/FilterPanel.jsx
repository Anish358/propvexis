import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FILTER_GROUPS, FILTERS, FILTER_BY_ID, DATE_PRESETS,
  activeDefs, chipValue, clearPatch, isActive, presetRange, valueOptions,
} from './filterDefs.js';

// The filter panel: a FILTER BUILDER, not a form.
//
// The panel opens nearly empty — a chip row for what's already applied and one
// "Add filter" row. Choosing a filter opens a second menu BESIDE the first rather
// than replacing it, so the path you took stays on screen (chips → which filter →
// which values). Nothing is hidden behind scroll until you ask for it, which is
// what lets the registry grow to dozens of dimensions without the panel growing at
// all: height is a function of what you've SELECTED, not of what exists.
//
// Everything here is generic over filterDefs.js — this file knows about the four
// TYPES (multi / single / range / date), never about individual filters. A new
// dimension appears in the menu with no change to this component.
//
// Keyboard model is the command-palette one: focus stays in the search box, the
// highlighted row is virtual (aria-activedescendant), ↑/↓ moves it, Enter commits,
// Escape unwinds one level at a time, and Backspace on an empty search steps back.

const Chevron = () => (
  <svg className="fp-row-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
);
const Plus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
const Cross = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
);

const match = (text, q) => text.toLowerCase().includes(q.trim().toLowerCase());

// One searchable, arrow-navigable menu column. Owns its query + cursor so opening
// a submenu never disturbs the menu that spawned it.
// A column states what it is exactly ONCE, using whichever element it has: a list
// column says it in the search placeholder ("Search probability…") and renders no
// heading; a range or date column has no search box, so it gets the heading
// instead. Passing `title` is what asks for the heading.
export function Menu({
  title, ariaLabel, placeholder, items, onPick, onHover, onBack, footer, children,
  multi = false, menuRef, className = '', style,
}) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef(null);
  const bodyRef = useRef(null);
  const hoverTimer = useRef(null);
  const id = useRef(`fp-menu-${Math.random().toString(36).slice(2, 8)}`).current;

  // Hovering a filter opens its values — no click needed. The short delay is what
  // makes that bearable: sweeping the pointer down the list would otherwise fire a
  // column open per row crossed. Only the pointer does this; arrowing with the
  // keyboard just moves the highlight, so browsing the list stays quiet.
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const hoverOpen = (row, el) => {
    if (!onHover || row.soon) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => onHover(row, el), 60);
  };
  const cancelHover = () => clearTimeout(hoverTimer.current);

  // Rows are {id, label, …} for pickable entries and {group: label} for headings.
  const rows = useMemo(() => {
    if (!items) return [];
    const q2 = q.trim();
    const kept = items.filter((row) => row.group
      || !q2 || match(row.label, q2) || (row.hint && match(row.hint, q2)));
    // A heading whose whole section was searched away would otherwise sit there
    // labelling nothing, so drop any heading not followed by a row of its own.
    return kept.filter((row, i) => !row.group || (kept[i + 1] && !kept[i + 1].group));
  }, [items, q]);

  const pickable = rows.filter((r) => !r.group && !r.soon);
  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => { searchRef.current?.focus(); }, []);
  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = bodyRef.current?.querySelector('.is-cursor');
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const activeId = pickable[cursor] ? `${id}-${pickable[cursor].id}` : undefined;

  const onKeyDown = (e) => {
    if (e.key === 'Backspace' && !q && onBack) { e.preventDefault(); onBack(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!pickable.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setCursor((c) => (c + step + pickable.length) % pickable.length);
      return;
    }
    if (e.key === 'Enter' && pickable[cursor]) {
      e.preventDefault();
      // The highlighted row doubles as the anchor, so a keyboard open lands the
      // values column beside the same row a pointer open would have.
      onPick(pickable[cursor], bodyRef.current?.querySelector('.is-cursor'));
      // A multi-select stays open so several values can be picked in a row; the
      // search is cleared because the next value is a different search.
      if (multi) setQ('');
    }
  };

  return (
    <div className={`fp-menu ${className}`} style={style} ref={menuRef} onKeyDown={onKeyDown}>
      {title && (
        <div className="fp-menu-head">
          {onBack && (
            <button type="button" className="fp-menu-back" onClick={onBack} aria-label="Back to filter list">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          <span className="fp-menu-title">{title}</span>
        </div>
      )}
      {items && (
        <input
          ref={searchRef}
          className="fp-search"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          // The placeholder names the input ("Search strategy…"); `ariaLabel` names
          // the LIST below it ("Strategy"). Using the latter here would leave the
          // field announced as "Strategy", which describes the list, not the box.
          aria-label={placeholder}
          role="combobox"
          aria-expanded="true"
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
        />
      )}
      {children}
      {items && (
        // aria-label carries the filter's name for a screen reader now that the
        // heading is gone from the list columns.
        <div className="fp-menu-body" ref={bodyRef} id={id} role="listbox" aria-label={ariaLabel} aria-multiselectable={multi || undefined}>
          {rows.map((row, i) => (row.group ? (
            <div key={`g-${row.group}-${i}`} className="fp-menu-group" role="presentation">{row.group}</div>
          ) : (
            <div
              key={row.id}
              id={`${id}-${row.id}`}
              className={`fp-row ${pickable[cursor]?.id === row.id ? 'is-cursor' : ''} ${row.soon ? 'fp-row--soon' : ''} ${row.on ? 'is-on' : ''}`}
              role="option"
              // Selection state belongs to the VALUE columns. In the choose
              // column "on" means "this filter already has a value", which is a
              // hint about the row's target, not a selection — marked with a dot.
              aria-selected={row.box ? !!row.on : undefined}
              aria-disabled={row.soon || undefined}
              onMouseEnter={(e) => {
                const at = pickable.findIndex((p) => p.id === row.id);
                if (at >= 0) setCursor(at);
                hoverOpen(row, e.currentTarget);
              }}
              onMouseLeave={cancelHover}
              onClick={(e) => {
                if (row.soon) return;
                cancelHover();
                onPick(row, e.currentTarget);
                if (multi) setQ('');
              }}
            >
              {row.box && <span className={`fp-box ${row.box === 'radio' ? 'fp-box--radio' : ''} ${row.on ? 'is-on' : ''}`} aria-hidden="true" />}
              <span className="fp-row-label">{row.label}</span>
              {!row.box && row.on && <span className="fp-dot" title="Currently filtered" />}
              {row.soon && <span className="fp-soon">Soon</span>}
              {row.count != null && <span className="fp-row-count">{row.count}</span>}
              {row.chev && <Chevron />}
            </div>
          )))}
          {!rows.some((r) => !r.group) && <div className="fp-empty">No matches</div>}
        </div>
      )}
      {footer}
    </div>
  );
}

// Min/Max pair. Kept in local draft strings so a half-typed value ("-", "1.") is
// never coerced into the filter; each side commits the moment it parses, and an
// emptied side commits back to "open-ended".
export function RangeBody({ def, value, onChange }) {
  const asText = (n) => (n == null ? '' : String(n));
  const parse = (s) => (s === '' || s === '-' || !Number.isFinite(Number(s)) ? null : Number(s));
  const [draft, setDraft] = useState({ min: asText(value?.min), max: asText(value?.max) });

  // Re-seed only when the stored value stops agreeing with what's typed — i.e.
  // when something OTHER than these inputs changed it (the column's Clear, or
  // Clear all). Reseeding unconditionally would overwrite a half-typed "1." with
  // "1" mid-keystroke and move the caret.
  useEffect(() => {
    if (parse(draft.min) === (value?.min ?? null) && parse(draft.max) === (value?.max ?? null)) return;
    setDraft({ min: asText(value?.min), max: asText(value?.max) });
  });

  const commit = (next) => {
    setDraft(next);
    onChange({ min: parse(next.min), max: parse(next.max) });
  };
  const unit = def.prefix || def.suffix || '';
  const bad = draft.min !== '' && draft.max !== '' && Number(draft.min) > Number(draft.max);

  return (
    <div className="fp-range">
      {[['min', 'Minimum'], ['max', 'Maximum']].map(([k, label]) => (
        <label key={k} className="fp-field">
          <span className="fp-field-label">{label}</span>
          <span className="fp-field-input">
            {def.prefix && <span className="fp-field-affix">{def.prefix}</span>}
            <input
              type="number"
              inputMode="decimal"
              step={def.step || '1'}
              value={draft[k]}
              placeholder="Any"
              autoFocus={k === 'min'}
              onChange={(e) => commit({ ...draft, [k]: e.target.value })}
            />
            {def.suffix && <span className="fp-field-affix">{def.suffix}</span>}
          </span>
        </label>
      ))}
      {bad
        ? <p className="fp-note">Minimum is above maximum — no trades can match.</p>
        : <p className="fp-hint">Leave a side blank for no bound{unit && def.suffix ? `. Values in ${def.suffix}.` : '.'}</p>}
    </div>
  );
}

// The date window keeps the native pickers it always had; presets sit above them
// because a relative window is what people reach for first. A preset writes real
// dates (see presetRange) — the chip re-reads them as "Last 30 days" while they
// still are that.
export function DateBody({ filters, patchFilters }) {
  return (
    <div className="fp-date">
      <div className="fp-presets">
        {DATE_PRESETS.map((p) => {
          const r = presetRange(p.id);
          const on = filters.from === r.from && filters.to === r.to;
          return (
            <button
              key={p.id}
              type="button"
              className={`fp-preset ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => patchFilters(r)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="fp-date-pair">
        {[['from', 'From'], ['to', 'To']].map(([k, label]) => (
          <label key={k} className="fp-field">
            <span className="fp-field-label">{label}</span>
            <input
              type="date"
              className="fp-date-input"
              value={filters[k] || ''}
              max={k === 'from' ? filters.to || undefined : undefined}
              min={k === 'to' ? filters.from || undefined : undefined}
              onChange={(e) => patchFilters({ [k]: e.target.value || null })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function FilterPanel({ options = {}, filters, patchFilters, clearFilters, active = 0, onClose }) {
  // `adding` = the choose-a-filter column is open. `pickedId` = which filter's
  // value column is open beside it. Editing a chip sets both, so the first column
  // still shows where you are in the list.
  const [adding, setAdding] = useState(active === 0);
  const [pickedId, setPickedId] = useState(null);
  const def = pickedId ? FILTER_BY_ID[pickedId] : null;
  const chips = activeDefs(filters);

  // The values column is anchored to the ROW that opened it (see the layout effect
  // below), so it reads as belonging to that filter rather than to the panel.
  // `anchorTop` is the row's offset within the cascade; null means "no row" (a chip
  // opened it), which falls back to aligning with the top of the choose column.
  const cascadeRef = useRef(null);
  const valuesRef = useRef(null);
  const [anchorTop, setAnchorTop] = useState(null);
  const [valuesTop, setValuesTop] = useState(null);

  const anchorFrom = (el) => {
    const cascade = cascadeRef.current;
    if (!el || !cascade) { setAnchorTop(null); return; }
    setAnchorTop(el.getBoundingClientRect().top - cascade.getBoundingClientRect().top);
  };

  const openDef = (id, el) => { setAdding(true); setPickedId(id); anchorFrom(el); };
  const closeValues = () => setPickedId(null);

  // Line the column's FIRST ROW up with the row that opened it — not the column's
  // top edge, which would leave the header and search box pointing at it instead.
  // The lead is measured rather than hardcoded so tuning the header or search
  // padding can't silently break the alignment. Measured values are all internal
  // (offset within the column, its own height), so setting `top` from them can't
  // feed back into the next measurement.
  // useLayoutEffect, not useEffect: the column has just appeared, so correcting its
  // offset after paint would show it jumping from the top of the cascade.
  useLayoutEffect(() => {
    const el = valuesRef.current;
    const cascade = cascadeRef.current;
    if (!el || !cascade) return;
    if (anchorTop == null) { setValuesTop(0); return; }
    const box = el.getBoundingClientRect();
    const first = el.querySelector('.fp-row, .fp-range, .fp-date');
    const lead = first ? first.getBoundingClientRect().top - box.top : 0;
    // Clamp into the viewport: a filter near the bottom of a long list would
    // otherwise anchor its column half off-screen.
    const cTop = cascade.getBoundingClientRect().top;
    const min = 8 - cTop;
    const max = Math.max(min, window.innerHeight - 8 - el.offsetHeight - cTop);
    const next = Math.round(Math.min(Math.max(anchorTop - lead, min), max));
    setValuesTop((prev) => (prev === next ? prev : next));
    // The footer appears once a filter has a value, which changes the column's
    // height and therefore the bottom clamp — so it belongs in the deps.
  }, [pickedId, anchorTop, def ? isActive(def, filters) : false]);

  // Escape unwinds one column at a time: values → choose → the panel itself.
  // Bound on the document rather than the panel's own onKeyDown because the date
  // and range columns have no search box to hold focus, so a React-tree handler
  // would only fire for some of the columns.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (pickedId) closeValues();
      else if (adding && chips.length) setAdding(false);
      else onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickedId, adding, chips.length, onClose]);

  // Level 1 — every registered filter, grouped, with the active ones marked.
  const chooseItems = useMemo(() => {
    const rows = [];
    for (const g of FILTER_GROUPS) {
      const defs = FILTERS.filter((d) => d.group === g.id);
      if (!defs.length) continue;
      rows.push({ group: g.label });
      for (const d of defs) {
        rows.push({
          id: d.id, label: d.label, hint: g.label, soon: d.soon,
          chev: !d.soon, on: isActive(d, filters),
        });
      }
    }
    return rows;
  }, [filters]);

  // Level 2 — the picked filter's values. Lists for multi/single; the range and
  // date editors render as `children` instead, since neither has a list to search.
  const valueItems = useMemo(() => {
    if (!def || def.type === 'range' || def.type === 'date') return null;
    const rows = [];
    if (def.type === 'single') {
      rows.push({ id: '', label: def.anyLabel || 'Any', box: 'radio', on: !isActive(def, filters) });
    }
    for (const o of valueOptions(def, options)) {
      const on = def.type === 'multi'
        ? (filters[def.id] || []).includes(o.value)
        : filters[def.id] === o.value;
      rows.push({ id: o.value, label: o.label, box: def.type === 'multi' ? 'check' : 'radio', on });
    }
    return rows;
  }, [def, filters, options]);

  const pickValue = (row) => {
    if (!def) return;
    if (def.type === 'multi') {
      const cur = filters[def.id] || [];
      const next = cur.includes(row.id) ? cur.filter((v) => v !== row.id) : [...cur, row.id];
      patchFilters({ [def.id]: next });
      return;
    }
    // Single-value: picking is a decision, so the column closes behind it.
    patchFilters({ [def.id]: row.id });
    closeValues();
  };


  return (
    // The panel sits under the button; the cascade sits under the PANEL, opening
    // right-to-left (see .fp-cascade) because the button is at the right edge of
    // the top bar — so every column stays on screen without measuring anything.
    <div className="fp-stack">
      <div className="fp">
        <div className="fp-head">
          <span className="fp-head-title">Filters</span>
          {active > 0 && (
            <button type="button" className="fp-head-clear" onClick={() => { clearFilters(); setPickedId(null); setAdding(true); }}>
              Clear all
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <div className="fp-chips">
            {chips.map((d) => (
              <span key={d.id} className={`fp-chip ${pickedId === d.id ? 'is-editing' : ''}`}>
                <button
                  type="button"
                  className="fp-chip-main"
                  onClick={() => (pickedId === d.id ? closeValues() : openDef(d.id))}
                  aria-expanded={pickedId === d.id}
                  title={`Edit ${d.label} filter`}
                >
                  <span className="fp-chip-key">{d.label}</span>
                  <span className="fp-chip-val">{chipValue(d, filters, options)}</span>
                </button>
                <button
                  type="button"
                  className="fp-chip-x"
                  onClick={() => { patchFilters(clearPatch(d)); if (pickedId === d.id) closeValues(); }}
                  aria-label={`Remove ${d.label} filter`}
                >
                  <Cross />
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          className={`fp-add ${adding && !pickedId ? 'is-on' : ''}`}
          onClick={() => { if (adding) { setAdding(false); setPickedId(null); } else setAdding(true); }}
          aria-expanded={adding}
        >
          <Plus />
          <span>Add filter</span>
        </button>

        {chips.length === 0 && !adding && (
          <p className="fp-blank">No filters — every trade in scope is included.</p>
        )}
      </div>

      {/* The cascade hangs BELOW the panel rather than alongside it, so the
          columns never run up beside the top bar. The values column opens to the
          LEFT of the choose column and level with the row that opened it. */}
      {(adding || def) && (
        <div className="fp-cascade" ref={cascadeRef}>
          {adding && (
            <Menu
              title="Add filter"
              placeholder="Search filters…"
              items={chooseItems}
              onPick={(row, el) => { setPickedId(row.id); anchorFrom(el); }}
              // Hovering a filter opens its values; clicking is still fine. Both
              // hand over the row element so the column can line up with it.
              onHover={(row, el) => { setPickedId(row.id); anchorFrom(el); }}
            />
          )}

          {def && (
            <Menu
              key={def.id}
              menuRef={valuesRef}
              className="fp-menu--values"
              style={valuesTop == null ? undefined : { top: `${valuesTop}px` }}
              // No heading on a list column — its search placeholder already names
              // the filter, and a title above it just repeats itself. Range and
              // date columns have no search box, so they keep the heading.
              title={valueItems ? undefined : def.label}
              ariaLabel={def.label}
              placeholder={`Search ${def.label.toLowerCase()}…`}
              items={valueItems}
              multi={def.type === 'multi'}
              onPick={pickValue}
              onBack={closeValues}
              footer={isActive(def, filters) ? (
                <div className="fp-menu-foot">
                  <button type="button" className="fp-menu-clear" onClick={() => patchFilters(clearPatch(def))}>
                    Clear {def.label.toLowerCase()}
                  </button>
                </div>
              ) : null}
            >
              {def.type === 'range' && (
                <RangeBody def={def} value={filters[def.id] || {}} onChange={(v) => patchFilters({ [def.id]: v })} />
              )}
              {def.type === 'date' && <DateBody filters={filters} patchFilters={patchFilters} />}
            </Menu>
          )}
        </div>
      )}
    </div>
  );
}
