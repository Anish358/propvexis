// Dashboard layout — what the layout editor edits and the Dashboard renders.
//
// The MACHINERY (sanitize, visibility, reorder, grid footprints) lives in
// layoutModel.js and is shared with the Prop OS Overview; this file is the
// dashboard's CATALOGUE plus the names the rest of the app already imports.
// Adding a widget here is a data edit — provided Dashboard.jsx registers a
// renderer for the id (a test enforces that pairing, so a half-added widget
// can't ship as an invisible gap).
//
// The layout is a GLOBAL user preference, stored at the top level of
// `viewConfigs` alongside `unit` — NOT per account scope. Switching trading
// accounts must never rearrange the workspace.
//
// Three stacked sections, reorderable vertically:
//   brief → Today's Brief · kpis → the KPI card row · main → the content grid
// Two zones of widgets, each reorderable only within itself. A drag never crosses
// zones: a KPI card cannot leave the KPI row, and a grid widget cannot become a
// section.

import { createLayoutModel, makeSizes, moveId, moveIdBefore } from './layoutModel.js';

export const GRID_COLUMNS = 3;

export const WIDGET_SIZES = makeSizes(GRID_COLUMNS);

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

// `full` (3×1) is Account Health's: a full-width banner, where a 2×1 would let a
// 1×1 pack in beside it and visibly restructure the page.
export const MAIN_WIDGETS = [
  { id: 'account', label: 'Account Health', size: 'full' },
  { id: 'calendar', label: 'Calendar', size: 'large' },
  { id: 'activity', label: 'Recent Activity', size: 'small' },
  { id: 'cumulative', label: 'Cumulative P&L', size: 'small' },
];

const model = createLayoutModel({
  sections: DASH_SECTIONS,
  kpis: KPI_WIDGETS,
  main: MAIN_WIDGETS,
  columns: GRID_COLUMNS,
});

export const DASH_ZONES = model.ZONES;
export const DASH_LABEL = model.LABEL;

export const widgetSpan = model.widgetSpan;
export const widgetSizeName = model.widgetSizeName;

export const defaultDashLayout = model.defaultLayout;
export const sanitizeDashLayout = model.sanitizeLayout;
export const isDefaultDashLayout = model.isDefaultLayout;

export const isDashVisible = model.isVisible;
export const visibleDashIds = model.visibleIds;
export const hiddenDashWidgets = model.hiddenWidgets;
export const sectionVisible = model.sectionVisible;
export const visibleSections = model.visibleSections;

export const moveDashId = moveId;
export const moveDashIdBefore = moveIdBefore;
