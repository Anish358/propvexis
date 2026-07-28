// Dashboard layout model — what the layout editor edits and the Dashboard renders.
//
// Deliberately pure (no React, no DOM) so the editor's miniature wireframe and
// the real dashboard read the SAME rules from the SAME data. That's what makes
// the miniature a live editor rather than a preview that can drift out of sync.
//
// The layout is a GLOBAL user preference, stored at the top level of
// `viewConfigs` alongside `unit` — NOT per account scope. Switching trading
// accounts must never rearrange the workspace.
//
// ---- structure --------------------------------------------------------------
// Three stacked sections, reorderable vertically:
//   brief → Today's Brief
//   kpis  → the KPI card row
//   main  → everything below, laid out on a grid
//
// Two zones of widgets, each reorderable only within itself:
//   kpis → the 5 KPI cards (a single horizontal row)
//   main → the content grid
//
// ---- why an ordered list, not (x, y) coordinates ----------------------------
// Grid widgets are an ORDERED LIST with a fixed size each, placed by CSS Grid's
// dense auto-flow. Dragging reorders the list; the browser does the packing. That
// means no coordinates to persist, no collision resolution to write, and a new
// widget is literally one catalogue entry — it flows into the first hole that
// fits. Storing positions would buy freeform placement, which is explicitly not
// wanted ("no freeform positioning, widgets snap to the grid").

export const GRID_COLUMNS = 3;

// The closed size vocabulary. Sizes are a property of the WIDGET, not a user
// control — there is no resize handle, by design ("do NOT allow arbitrary
// resizing"). To change one, edit its catalogue entry below.
//
// `full` (3×1) is ours, beyond the four named sizes: Account Health is a
// full-width banner today, and a 2×1 would let a 1×1 pack in beside it and
// visibly restructure the page. Any future full-bleed row should reuse it.
export const WIDGET_SIZES = {
  small: { cols: 1, rows: 1 },
  wide: { cols: 2, rows: 1 },
  tall: { cols: 1, rows: 2 },
  large: { cols: 2, rows: 2 },
  full: { cols: GRID_COLUMNS, rows: 1 },
};

export const DASH_SECTIONS = [
  { id: 'brief', label: "Today's Brief" },
  { id: 'kpis', label: 'KPI Cards' },
  { id: 'main', label: 'Main Content' },
];

export const KPI_WIDGETS = [
  { id: 'netPnl', label: 'Net P&L' },
  { id: 'tradeWin', label: 'Trade Win %' },
  { id: 'profitFactor', label: 'Profit Factor' },
  { id: 'dayWin', label: 'Day Win %' },
  { id: 'avgWinLoss', label: 'Avg Win/Loss' },
];

// The content grid. Adding a widget here is all that's needed for it to appear
// in the editor AND on the dashboard — provided Dashboard.jsx registers a
// renderer for the id (a test enforces that pairing, so a half-added widget
// can't ship as an invisible gap).
export const MAIN_WIDGETS = [
  { id: 'account', label: 'Account Health', size: 'full' },
  { id: 'calendar', label: 'Calendar', size: 'large' },
  { id: 'activity', label: 'Recent Activity', size: 'small' },
  { id: 'cumulative', label: 'Cumulative P&L', size: 'small' },
];

// Zones a drag can happen within. A drag never crosses zones: a KPI card cannot
// leave the KPI row, and a grid widget cannot become a section.
export const DASH_ZONES = ['sections', 'kpis', 'main'];

const CATALOGUE = {
  sections: DASH_SECTIONS,
  kpis: KPI_WIDGETS,
  main: MAIN_WIDGETS,
};

const zoneIds = (zone) => CATALOGUE[zone].map((w) => w.id);

export const DASH_LABEL = Object.fromEntries(
  DASH_ZONES.flatMap((z) => CATALOGUE[z].map((w) => [w.id, w.label])),
);

const SIZE_BY_ID = Object.fromEntries(MAIN_WIDGETS.map((w) => [w.id, w.size]));
const ALL_IDS = new Set(Object.keys(DASH_LABEL));

// Grid footprint of a main-grid widget, defaulting to 1×1 for anything unsized.
export function widgetSpan(id) {
  return WIDGET_SIZES[SIZE_BY_ID[id]] || WIDGET_SIZES.small;
}
export const widgetSizeName = (id) => SIZE_BY_ID[id] || 'small';

// ---- defaults + persistence -------------------------------------------------

export const defaultDashLayout = () => ({
  sections: zoneIds('sections'),
  kpis: zoneIds('kpis'),
  main: zoneIds('main'),
  hidden: {},
});

// Reconcile a persisted layout with the current catalogue. Saved order wins for
// ids we still know about; unknown ids (a removed widget, or a key from an older
// model) are dropped; ids the save predates are appended VISIBLE at the end of
// their zone — so shipping a new widget neither hides it from existing users nor
// discards their arrangement.
export function sanitizeDashLayout(saved) {
  const base = defaultDashLayout();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;

  for (const zone of DASH_ZONES) {
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
  }
  base.hidden = hidden;
  return base;
}

// Compared structurally rather than by JSON.stringify, which would also depend on
// key insertion order.
export function isDefaultDashLayout(layout) {
  const l = sanitizeDashLayout(layout);
  const base = defaultDashLayout();
  if (Object.keys(l.hidden).length > 0) return false;
  return DASH_ZONES.every((z) => l[z].length === base[z].length && l[z].every((id, i) => id === base[z][i]));
}

// ---- visibility -------------------------------------------------------------

export const isDashVisible = (layout, id) => !layout?.hidden?.[id];

export const visibleDashIds = (layout, zone) =>
  (layout?.[zone] || zoneIds(zone)).filter((id) => isDashVisible(layout, id));

// Hidden widgets vanish from the miniature as well as the dashboard, so the
// editor needs a tray to get them back — this is what fills it.
export function hiddenDashWidgets(layout) {
  const l = sanitizeDashLayout(layout);
  return DASH_ZONES.flatMap((zone) => l[zone]
    .filter((id) => !isDashVisible(l, id))
    .map((id) => ({ id, zone, label: DASH_LABEL[id] })));
}

// A section disappears once everything inside it is off, so hiding all 5 KPI
// cards doesn't leave an empty band (and its gap) behind.
export function sectionVisible(layout, id) {
  if (!isDashVisible(layout, id)) return false;
  if (id === 'kpis') return visibleDashIds(layout, 'kpis').length > 0;
  if (id === 'main') return visibleDashIds(layout, 'main').length > 0;
  return true;
}

export const visibleSections = (layout) =>
  (layout?.sections || zoneIds('sections')).filter((id) => sectionVisible(layout, id));

// ---- reordering -------------------------------------------------------------

// Move the item at `from` to index `to`, returning a new array. Out-of-range or
// no-op moves return the list unchanged (identity-stable, so React can bail).
export function moveDashId(list, from, to) {
  if (!Array.isArray(list)) return list;
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Move a widget by ID rather than index. The editor reorders LIVE during a drag,
// so by the time the next pointermove lands the dragged item's index has already
// changed — addressing it by id is the only stable way to keep moving it.
export function moveDashIdBefore(list, id, targetId) {
  if (!Array.isArray(list) || id === targetId) return list;
  const from = list.indexOf(id);
  const to = list.indexOf(targetId);
  if (from < 0 || to < 0) return list;
  return moveDashId(list, from, to);
}
