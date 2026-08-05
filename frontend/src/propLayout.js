// Prop OS → Overview layout — the BUSINESS workspace's catalogue.
//
// Same machinery as the Dashboard (layoutModel.js), different question. The
// Dashboard's cards are trading metrics; every card named here is a company
// metric: what the operation earned, what it costs to run, how much capital is
// under management, how often evaluations convert.
//
// Stored at the top level of `viewConfigs` as `propLayout`, beside `dashLayout` —
// a GLOBAL user preference, not per account scope. The Overview deliberately
// spans every account (see the /api/prop/overview route), so there is no account
// scope for it to vary by in the first place.

import { createLayoutModel, makeSizes, moveId, moveIdBefore } from './layoutModel.js';

export const PROP_GRID_COLUMNS = 3;

export const PROP_WIDGET_SIZES = makeSizes(PROP_GRID_COLUMNS);

export const PROP_SECTIONS = [
  { id: 'brief', label: 'Prop Brief' },
  { id: 'kpis', label: 'Business KPIs' },
  { id: 'main', label: 'Main Content' },
];

// The six business KPIs. Five ship ON; Current Monthly Fees ships OFF — it is
// useful to the trader auditing their spend and noise to everyone else, which is
// what an opt-in card is for. Off-by-default is NOT the same as "the user hid
// it": sanitizeLayout seeds this only on a first, unsaved layout, so turning it
// on survives every subsequent load.
export const PROP_KPIS = [
  { id: 'totalEarned', label: 'Total Earned' },
  { id: 'activeAccounts', label: 'Active Accounts' },
  { id: 'totalFunding', label: 'Total Funding' },
  { id: 'evalSuccess', label: 'Evaluation Success Rate' },
  { id: 'monthlyPayout', label: 'Monthly Payout' },
  { id: 'monthlyFees', label: 'Current Monthly Fees' },
];

export const PROP_DEFAULT_HIDDEN = ['monthlyFees'];

// The content grid, on a 3-column dense flow. The three 1×1 cards fill the first
// row; the calendar (2×2) and the accounts card (1×2) fill the two rows beneath
// it exactly. That packing is a consequence of the ordinal list plus each
// widget's size — there are no coordinates here, and reordering re-packs.
//
// A widget listed here MUST have a renderer in PropOS.jsx, or it drags around
// fine and renders as an invisible hole. A test enforces the pairing.
export const PROP_MAIN_WIDGETS = [
  { id: 'firms', label: 'Prop Firms', size: 'small' },
  { id: 'payouts', label: 'Upcoming Payouts', size: 'small' },
  { id: 'transactions', label: 'Recent Transactions', size: 'small' },
  { id: 'calendar', label: 'Calendar', size: 'large' },
  { id: 'accounts', label: 'Accounts', size: 'tall' },
];

const model = createLayoutModel({
  sections: PROP_SECTIONS,
  kpis: PROP_KPIS,
  main: PROP_MAIN_WIDGETS,
  columns: PROP_GRID_COLUMNS,
  defaultHidden: PROP_DEFAULT_HIDDEN,
});

export const PROP_ZONES = model.ZONES;
export const PROP_LABEL = model.LABEL;

export const propWidgetSpan = model.widgetSpan;
export const propWidgetSizeName = model.widgetSizeName;

export const defaultPropLayout = model.defaultLayout;
export const sanitizePropLayout = model.sanitizeLayout;
export const isDefaultPropLayout = model.isDefaultLayout;

export const isPropVisible = model.isVisible;
export const visiblePropIds = model.visibleIds;
export const hiddenPropWidgets = model.hiddenWidgets;
export const propSectionVisible = model.sectionVisible;
export const visiblePropSections = model.visibleSections;

export const movePropId = moveId;
export const movePropIdBefore = moveIdBefore;
