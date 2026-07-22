// Global, per-scope view filters. A "scope" is the god view ('god') or one MT5
// account (its login). Each scope owns a ViewConfig: the display unit (R/$) plus
// a set of data filters applied to EVERY component (dashboard, calendar, trade
// log, analytics). The same filters drive the in-memory pages and the backend
// stats endpoints, so the two always agree.
import { tradeOutcome } from './metrics.js';

// Known orderings so dropdowns read naturally; unknown values sort after.
export const SETUP_ORDER = ['Continue', 'Liq-run', 'Fractal', 'SMC'];
export const SESSION_ORDER = ['LDN', 'NY', 'ASIA'];
export const PROBABILITY_ORDER = ['HIGH', 'MED', 'LOW'];
export const OUTCOME_OPTIONS = [
  { value: 'win', label: 'Winners' },
  { value: 'loss', label: 'Losers' },
  { value: 'be', label: 'Breakeven' },
];

export const scopeKey = (accountId) => (accountId === 'all' || accountId == null ? 'god' : String(accountId));

export const emptyFilters = () => ({
  setups: [], symbols: [], sessions: [], probability: [], outcome: [], from: null, to: null,
});

// god defaults to R (cross-account risk multiples), a single account to its
// currency ($). Both are now overridable by the user via the filter bar.
// `widgets.overrides` is a per-scope map of widget id -> explicit on/off choice.
// Absent ids fall back to the widget's own per-scope default (see dashboardWidgets
// `defaultOn`), so new widgets get sensible defaults without a migration.
export const defaultConfig = (accountId) => ({
  // A single account defaults to its currency ($); the god view and any
  // multi-account selection (comma-joined logins) default to R (cross-account).
  unit: accountId === 'all' || accountId == null || String(accountId).includes(',') ? 'R' : 'USD',
  filters: emptyFilters(),
  widgets: { overrides: {} },
});

// Apply the data filters to a trade list. The display unit + precision setting
// only affect the outcome (win/loss/be) classification via `tradeOutcome`.
export function filterTrades(trades = [], f = emptyFilters(), unit = 'R', beRounding = false) {
  const has = (arr) => Array.isArray(arr) && arr.length > 0;
  const to = f.to ? new Date(`${f.to}T23:59:59`) : null;
  const from = f.from ? new Date(`${f.from}T00:00:00`) : null;
  return trades.filter((t) => {
    if (has(f.setups) && !f.setups.includes(t.setup)) return false;
    if (has(f.symbols) && !f.symbols.includes(t.symbol_base || t.symbol)) return false;
    if (has(f.sessions) && !f.sessions.includes(t.session)) return false;
    if (has(f.probability) && !f.probability.includes(t.probability)) return false;
    if (has(f.outcome) && !f.outcome.includes(tradeOutcome(t, unit, beRounding))) return false;
    if (from || to) {
      const c = new Date(t.close_time);
      if (from && c < from) return false;
      if (to && c > to) return false;
    }
    return true;
  });
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

// The filter values actually present in the (unfiltered) scoped trade set, so
// the dropdowns only offer choices that exist.
export function availableOptions(trades = []) {
  return {
    setups: uniqSorted(trades.map((t) => t.setup), SETUP_ORDER),
    symbols: uniqSorted(trades.map((t) => t.symbol_base || t.symbol), null),
    sessions: uniqSorted(trades.map((t) => t.session), SESSION_ORDER),
    probability: uniqSorted(trades.map((t) => t.probability), PROBABILITY_ORDER),
  };
}

// How many filter dimensions are active (for the "Clear (N)" affordance).
export function activeFilterCount(f = emptyFilters()) {
  let n = 0;
  for (const k of ['setups', 'symbols', 'sessions', 'probability', 'outcome']) if (f[k]?.length) n += 1;
  if (f.from || f.to) n += 1;
  return n;
}

// Serialize data filters to a query-string fragment for the stats endpoints.
// (unit is sent separately.) Returns '' or '&k=v&…'.
export function filtersToQuery(f = emptyFilters()) {
  const p = new URLSearchParams();
  const csv = (k, arr) => { if (arr?.length) p.set(k, arr.join(',')); };
  csv('setups', f.setups);
  csv('symbols', f.symbols);
  csv('sessions', f.sessions);
  csv('probability', f.probability);
  csv('outcome', f.outcome);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  const s = p.toString();
  return s ? `&${s}` : '';
}
