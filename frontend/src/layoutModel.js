// The generic layout-model engine.
//
// Extracted from dashLayout.js when the Prop OS Overview needed the same
// machinery — an ordered, hideable set of sections/cards persisted per user — for
// a completely different catalogue of widgets. The alternative was a second copy
// of sanitize/visibility/reorder, which is exactly the kind of duplication that
// drifts the first time either page is touched.
//
// Everything here is pure (no React, no DOM), so a page's real render and any
// miniature/editor of it read the SAME rules from the SAME data.
//
// A "model" is created from a catalogue and exposes the functions bound to it.
// dashLayout.js and propLayout.js are the two instances; neither adds logic, they
// only declare what their zones contain.
//
// ---- why an ordered list, not (x, y) coordinates ----------------------------
// Grid widgets are an ORDERED LIST with a fixed size each, placed by CSS Grid's
// dense auto-flow. Reordering the list is the whole edit; the browser does the
// packing. No coordinates to persist, no collision resolution, and a new widget
// is one catalogue entry that flows into the first hole that fits.

// The closed size vocabulary, shared by every model. Sizes are a property of the
// WIDGET, not a user control — there is no resize handle, by design.
//
// `full` is ours beyond the four named sizes: a full-bleed banner row must not
// let a 1x1 pack in beside it and visibly restructure the page.
export const makeSizes = (columns) => ({
  small: { cols: 1, rows: 1 },
  wide: { cols: 2, rows: 1 },
  tall: { cols: 1, rows: 2 },
  large: { cols: 2, rows: 2 },
  full: { cols: columns, rows: 1 },
});

// `catalogue` is { sections: [{id,label}], kpis: [...], main: [{id,label,size}] }.
// `columns` is the main grid's width. `defaultHidden` lists ids that ship OFF —
// an opt-in card, as distinct from one the user has since turned off.
export function createLayoutModel({ sections = [], kpis = [], main = [], columns = 3, defaultHidden = [] }) {
  const CATALOGUE = { sections, kpis, main };
  const ZONES = ['sections', 'kpis', 'main'];
  const SIZES = makeSizes(columns);

  const zoneIds = (zone) => (CATALOGUE[zone] || []).map((w) => w.id);

  const LABEL = Object.fromEntries(
    ZONES.flatMap((z) => (CATALOGUE[z] || []).map((w) => [w.id, w.label])),
  );
  const SIZE_BY_ID = Object.fromEntries(main.map((w) => [w.id, w.size]));
  const ALL_IDS = new Set(Object.keys(LABEL));

  // Grid footprint, defaulting to 1x1 for anything unsized — an unknown id must
  // fall back rather than throw, so a stale persisted layout can't break a render.
  const widgetSpan = (id) => SIZES[SIZE_BY_ID[id]] || SIZES.small;
  const widgetSizeName = (id) => SIZE_BY_ID[id] || 'small';

  // ---- defaults + persistence ----------------------------------------------

  const defaultLayout = () => ({
    sections: zoneIds('sections'),
    kpis: zoneIds('kpis'),
    main: zoneIds('main'),
    hidden: Object.fromEntries(defaultHidden.map((id) => [id, true])),
  });

  // Reconcile a persisted layout with the current catalogue. Saved order wins for
  // ids we still know about; unknown ids (a removed widget, or a key from an older
  // model) are dropped; ids the save predates are appended VISIBLE at the end of
  // their zone — so shipping a new widget neither hides it from existing users nor
  // discards their arrangement.
  //
  // Note `defaultHidden` deliberately does NOT re-apply here: it seeds the default
  // only. Once a user has a saved layout, an opt-in card they turned ON must stay
  // on, and re-imposing the default would silently undo that on every load.
  function sanitizeLayout(saved) {
    const base = defaultLayout();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;

    for (const zone of ZONES) {
      const known = zoneIds(zone);
      const fromSaved = Array.isArray(saved[zone]) ? saved[zone].filter((id) => known.includes(id)) : [];
      const seen = new Set(fromSaved);
      base[zone] = [...fromSaved, ...known.filter((id) => !seen.has(id))];
    }

    const hidden = {};
    if (saved.hidden && typeof saved.hidden === 'object' && !Array.isArray(saved.hidden)) {
      for (const [id, off] of Object.entries(saved.hidden)) {
        if (off === true && ALL_IDS.has(id)) hidden[id] = true;
      }
    } else {
      // No hidden map at all (an older save, or a partial object) — fall back to
      // the shipped defaults rather than revealing an opt-in card.
      Object.assign(hidden, defaultLayout().hidden);
    }
    base.hidden = hidden;
    return base;
  }

  // Compared structurally rather than by JSON.stringify, which would also depend
  // on key insertion order.
  function isDefaultLayout(layout) {
    const l = sanitizeLayout(layout);
    const base = defaultLayout();
    const lh = Object.keys(l.hidden).sort();
    const bh = Object.keys(base.hidden).sort();
    if (lh.length !== bh.length || lh.some((k, i) => k !== bh[i])) return false;
    return ZONES.every((z) => l[z].length === base[z].length && l[z].every((id, i) => id === base[z][i]));
  }

  // ---- visibility -----------------------------------------------------------

  const isVisible = (layout, id) => !layout?.hidden?.[id];

  const visibleIds = (layout, zone) =>
    (layout?.[zone] || zoneIds(zone)).filter((id) => isVisible(layout, id));

  // Hidden widgets vanish from the page, so any editor needs a tray to get them
  // back — this is what fills it.
  function hiddenWidgets(layout) {
    const l = sanitizeLayout(layout);
    return ZONES.flatMap((zone) => l[zone]
      .filter((id) => !isVisible(l, id))
      .map((id) => ({ id, zone, label: LABEL[id] })));
  }

  // A section disappears once everything inside it is off, so hiding every card
  // doesn't leave an empty band (and its gap) behind.
  function sectionVisible(layout, id) {
    if (!isVisible(layout, id)) return false;
    if (id === 'kpis') return visibleIds(layout, 'kpis').length > 0;
    if (id === 'main') return visibleIds(layout, 'main').length > 0;
    return true;
  }

  const visibleSections = (layout) =>
    (layout?.sections || zoneIds('sections')).filter((id) => sectionVisible(layout, id));

  return {
    ZONES, LABEL, SIZES, COLUMNS: columns, CATALOGUE,
    widgetSpan, widgetSizeName,
    defaultLayout, sanitizeLayout, isDefaultLayout,
    isVisible, visibleIds, hiddenWidgets, sectionVisible, visibleSections,
  };
}

// ---- reordering -------------------------------------------------------------
// Catalogue-independent, so they live outside the factory and both models share
// one copy.

// Move the item at `from` to index `to`, returning a new array. Out-of-range or
// no-op moves return the list unchanged (identity-stable, so React can bail).
export function moveId(list, from, to) {
  if (!Array.isArray(list)) return list;
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Move a widget by ID rather than index. An editor reorders LIVE during a drag,
// so by the time the next pointermove lands the dragged item's index has already
// changed — addressing it by id is the only stable way to keep moving it.
export function moveIdBefore(list, id, targetId) {
  if (!Array.isArray(list) || id === targetId) return list;
  const from = list.indexOf(id);
  const to = list.indexOf(targetId);
  if (from < 0 || to < 0) return list;
  return moveId(list, from, to);
}
