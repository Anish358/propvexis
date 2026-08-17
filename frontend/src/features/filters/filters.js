// Global, per-scope view filters. A "scope" is the god view ('god') or one MT5
// account (its login). Each scope owns a ViewConfig: the display unit (R/$) plus
// a set of data filters applied to EVERY component (dashboard, calendar, trade
// log, analytics). The same filters drive the in-memory pages and the backend
// stats endpoints, so the two always agree.
//
// WHAT each filter is lives in filterDefs.js (the registry). This module is the
// thin layer around it: the scope/config plumbing, plus the three generic
// operations everything else calls — filter a trade list, count what's active,
// serialize for the API. None of them name individual filters any more, so adding
// a dimension to the registry reaches all of them automatically.
import {
  FILTERS, activeDefs, countActive, matchesDef,
  emptyFilterState, sanitizeFilterState, filterStateToQuery,
  SETUP_ORDER, SESSION_ORDER, PROBABILITY_ORDER,
} from './filterDefs.js';

export {
  SETUP_ORDER, SESSION_ORDER, PROBABILITY_ORDER, OUTCOME_OPTIONS,
  FILTERS, FILTER_GROUPS, LIVE_FILTERS, FILTER_BY_ID,
} from './filterDefs.js';

export const scopeKey = (accountId) => (accountId === 'all' || accountId == null ? 'god' : String(accountId));

export const emptyFilters = emptyFilterState;
// Applied on every read of a persisted config — see sanitizeFilterState.
export const sanitizeFilters = sanitizeFilterState;

// The display unit (R/$) is a single global preference, not scoped per
// account — it only changes when the user clicks the toggle, never as a
// side effect of switching accounts. `dashboard.pinnedAccounts` holds the
// god-scope Dashboard's selected account (single-element array, kept as an
// array for storage-shape compatibility); empty = default to the first
// prop-challenge account.
export const DEFAULT_UNIT = 'R';

export const defaultConfig = () => ({
  filters: emptyFilters(),
  dashboard: { pinnedAccounts: [] },
});

// Apply the data filters to a trade list. The display unit + precision setting
// only affect the outcome (win/loss/be) classification via `tradeOutcome`.
export function filterTrades(trades = [], f = emptyFilters(), unit = 'R', beRounding = false) {
  const defs = activeDefs(f);
  if (!defs.length) return trades.slice();
  const ctx = { unit, beRounding };
  return trades.filter((t) => defs.every((def) => matchesDef(def, t, f, ctx)));
}

const uniqSorted = (vals, order) => {
  const set = [...new Set(vals.filter((v) => v != null && v !== ''))];
  set.sort((a, b) => {
    if (!order) return String(a).localeCompare(String(b));
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return set;
};

// The filter values actually present in the (unfiltered) scoped trade set, so the
// value menus only offer choices that exist. Driven by the registry: a def with an
// `optionsKey` declares which column it reads and how that column sorts.
const OPTION_SOURCES = {
  setups: { get: (t) => t.setup, order: SETUP_ORDER },
  symbols: { get: (t) => t.symbol_base || t.symbol, order: null },
  sessions: { get: (t) => t.session, order: SESSION_ORDER },
  probability: { get: (t) => t.probability, order: PROBABILITY_ORDER },
  mtf: { get: (t) => t.mtf_phase, order: null },
};

export function availableOptions(trades = []) {
  const out = {};
  for (const def of FILTERS) {
    const src = def.optionsKey && OPTION_SOURCES[def.optionsKey];
    if (!src) continue;
    out[def.optionsKey] = uniqSorted(trades.map(src.get), src.order);
  }
  return out;
}

// How many filter dimensions are active (for the button badge / "Clear all").
export const activeFilterCount = countActive;

// Serialize data filters to a query-string fragment for the stats endpoints.
// (unit is sent separately.) Returns '' or '&k=v&…'.
export const filtersToQuery = filterStateToQuery;
