// The FILTER REGISTRY — one entry per filterable dimension, and the only place a
// new filter has to be declared on the client.
//
// Why a registry at all: the old panel was a hand-written form (one <MultiSelect>
// per dimension, hard-coded in the top bar), so every new filter cost a control
// in the markup, a branch in filterTrades, a line in activeFilterCount and a line
// in filtersToQuery — and the panel grew a row taller each time. The roadmap wants
// dozens of filters (tags, playbook, prop firm, platform, psychology, …), which
// that shape can't absorb.
//
// Here a filter is DATA: a def carries its label, its group, its type, where its
// values come from, how it reads a trade, and how it serializes. Everything
// generic — the panel UI, the client-side predicate, the active count, the chips,
// the query string — is derived by walking FILTERS. Adding a dimension is one
// object plus (if it's server-filtered too) one line in src/aggregations.js.
//
// Types:
//   multi  — checkbox list; value is an array of strings; [] = unfiltered
//   single — radio list;    value is a string; '' = unfiltered
//   range  — min/max pair;  value is { min, max }; nulls = open-ended
//   date   — the from/to close_time window; lives in two legacy keys
import { tradeOutcome } from '../../lib/metrics.js';

// Known orderings so value lists read naturally; unknown values sort after.
export const SETUP_ORDER = ['Continue', 'Liq-run', 'Fractal', 'SMC'];
export const SESSION_ORDER = ['LDN', 'NY', 'ASIA'];
export const PROBABILITY_ORDER = ['HIGH', 'MED', 'LOW'];
export const OUTCOME_OPTIONS = [
  { value: 'win', label: 'Winners' },
  { value: 'loss', label: 'Losers' },
  { value: 'be', label: 'Breakeven' },
];

// First-level sections. Order here is the order the Add-filter menu renders.
export const FILTER_GROUPS = [
  { id: 'trade', label: 'Trade' },
  { id: 'setup', label: 'Setup & context' },
  { id: 'performance', label: 'Performance' },
  { id: 'time', label: 'Time' },
  { id: 'account', label: 'Account' },
];

const WEEKDAYS = [
  { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' }, { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];

const symbolOf = (t) => t.symbol_base || t.symbol;
// Minutes held. Both bounds are real timestamps on every trade (EA and import).
const durationOf = (t) => {
  const open = Date.parse(t.open_time); const close = Date.parse(t.close_time);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
  return (close - open) / 60000;
};
// ISO weekday (Mon=1 … Sun=7) of the CLOSE. Read in UTC, not the viewer's zone:
// the stats layer extracts every timestamp part `AT TIME ZONE 'UTC'` (see
// src/statsSql.js), and the weekday a trade is filtered by has to be the same
// weekday it is grouped under, or the KPI cards and the trade table disagree for
// anyone east or west of UTC.
const weekdayOf = (t) => {
  const d = new Date(t.close_time);
  if (Number.isNaN(d.getTime())) return null;
  return String(d.getUTCDay() === 0 ? 7 : d.getUTCDay());
};

// Every live filter reads a column the EA or an import actually populates. The
// `soon` entries at the bottom are the roadmap's dimensions: shown in the menu so
// the growth path is visible, but inert until the data exists behind them.
export const FILTERS = [
  // ---- Trade ---------------------------------------------------------------
  {
    id: 'symbols', label: 'Symbol', group: 'trade', type: 'multi',
    optionsKey: 'symbols', query: 'symbols', get: symbolOf,
  },
  {
    id: 'direction', label: 'Direction', group: 'trade', type: 'single',
    query: 'direction', get: (t) => t.direction || '',
    values: [{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }],
    // "Both" isn't a stored value — it's the absence of the filter, so the menu's
    // Any row clears it rather than selecting a third option.
    anyLabel: 'Both',
  },
  {
    id: 'vol', label: 'Lot size', group: 'trade', type: 'range',
    query: 'vol', suffix: 'lots', step: '0.01', get: (t) => t.volume,
  },

  // ---- Setup & context -----------------------------------------------------
  {
    id: 'setups', label: 'Strategy', group: 'setup', type: 'multi',
    optionsKey: 'setups', query: 'setups', get: (t) => t.setup,
  },
  {
    id: 'sessions', label: 'Session', group: 'setup', type: 'multi',
    optionsKey: 'sessions', query: 'sessions', get: (t) => t.session,
  },
  {
    id: 'probability', label: 'Probability', group: 'setup', type: 'multi',
    optionsKey: 'probability', query: 'probability', get: (t) => t.probability,
  },
  {
    id: 'mtf', label: 'MTF phase', group: 'setup', type: 'multi',
    optionsKey: 'mtf', query: 'mtf', get: (t) => t.mtf_phase,
  },
  {
    id: 'journaled', label: 'Journaled', group: 'setup', type: 'single',
    query: 'journaled', get: (t) => (t.tagged ? 'yes' : 'no'),
    values: [{ value: 'yes', label: 'Journaled' }, { value: 'no', label: 'Not journaled' }],
  },

  // ---- Performance ---------------------------------------------------------
  {
    id: 'outcome', label: 'Result', group: 'performance', type: 'multi',
    values: OUTCOME_OPTIONS, query: 'outcome',
    // The only def whose reading depends on view state: win/loss/breakeven is
    // classified in the active unit, with the precision setting applied.
    get: (t, ctx = {}) => tradeOutcome(t, ctx.unit || 'R', ctx.beRounding),
  },
  {
    id: 'pnl', label: 'Net P&L', group: 'performance', type: 'range',
    query: 'pnl', prefix: '$', get: (t) => t.pnl_money,
  },
  {
    id: 'r', label: 'R multiple', group: 'performance', type: 'range',
    query: 'r', suffix: 'R', step: '0.1', get: (t) => t.fixed_r,
  },
  {
    id: 'maxR', label: 'Max R', group: 'performance', type: 'range',
    query: 'maxR', suffix: 'R', step: '0.1', get: (t) => t.max_r,
  },
  {
    id: 'risk', label: 'Risk (SL size)', group: 'performance', type: 'range',
    query: 'risk', suffix: 'pips', get: (t) => t.sl_size_pips,
  },

  // ---- Time ----------------------------------------------------------------
  {
    id: 'date', label: 'Date', group: 'time', type: 'date',
    // Kept in the two original top-level keys so configs saved by earlier
    // versions keep their date range after this change.
    keys: ['from', 'to'],
  },
  {
    id: 'dur', label: 'Hold time', group: 'time', type: 'range',
    query: 'dur', suffix: 'min', get: durationOf,
  },
  {
    id: 'dows', label: 'Weekday', group: 'time', type: 'multi',
    values: WEEKDAYS, query: 'dows', get: weekdayOf,
  },

  // ---- Account (roadmap) ---------------------------------------------------
  { id: 'propFirm', label: 'Prop firm', group: 'account', type: 'multi', soon: true },
  { id: 'platform', label: 'Platform', group: 'account', type: 'multi', soon: true },
  { id: 'tags', label: 'Tags', group: 'setup', type: 'multi', soon: true },
  { id: 'playbook', label: 'Playbook', group: 'setup', type: 'multi', soon: true },
];

export const LIVE_FILTERS = FILTERS.filter((d) => !d.soon);
export const FILTER_BY_ID = Object.fromEntries(FILTERS.map((d) => [d.id, d]));

// The state key(s) a def owns. Only `date` spans two (from/to); everything else
// is stored under its own id.
export const defKeys = (def) => def.keys || [def.id];

export const emptyValue = (def) => {
  if (def.type === 'multi') return [];
  if (def.type === 'single') return '';
  if (def.type === 'range') return { min: null, max: null };
  return null;
};

// The patch that removes this filter — one object whatever the type, so the chip's
// ✕ and the menu's Clear share a single path.
export const clearPatch = (def) => {
  if (def.type === 'date') return { from: null, to: null };
  return { [def.id]: emptyValue(def) };
};

export function isActive(def, f = {}) {
  if (def.soon) return false;
  if (def.type === 'date') return !!(f.from || f.to);
  const v = f[def.id];
  if (def.type === 'multi') return Array.isArray(v) && v.length > 0;
  if (def.type === 'single') return typeof v === 'string' && v !== '';
  if (def.type === 'range') return v != null && (v.min != null || v.max != null);
  return false;
}

// Defs with a value, in registry order — what the chip row renders.
export const activeDefs = (f = {}) => LIVE_FILTERS.filter((d) => isActive(d, f));

// How many dimensions are filtered (the badge on the Filters button).
export const countActive = (f = {}) => activeDefs(f).length;

// The selectable values for a multi/single def: static when the def names them,
// otherwise whatever exists in the current scope's trades (availableOptions).
export function valueOptions(def, options = {}) {
  if (def.values) return def.values;
  if (!def.optionsKey) return [];
  return (options[def.optionsKey] || []).map((v) => ({ value: v, label: v }));
}

// ---- formatting -------------------------------------------------------------

const num = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
};
const bound = (def, n) => (def.prefix ? `${def.prefix}${num(n)}` : `${num(n)}${def.suffix ? ` ${def.suffix}` : ''}`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
};

export const DATE_PRESETS = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'mtd', label: 'This month' },
  { id: 'ytd', label: 'This year' },
];

const isoDay = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// A preset writes a CONCRETE from/to rather than storing "last 30 days" — a stored
// relative range would silently re-scope every metric at midnight, and the backend
// stats endpoints take absolute dates anyway.
export function presetRange(id, now = new Date()) {
  const to = isoDay(now);
  const p = DATE_PRESETS.find((x) => x.id === id);
  if (!p) return { from: null, to: null };
  if (p.days) {
    const from = new Date(now);
    from.setDate(from.getDate() - (p.days - 1));
    return { from: isoDay(from), to };
  }
  if (p.id === 'mtd') return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  return { from: isoDay(new Date(now.getFullYear(), 0, 1)), to };
}

// …but the chip still SAYS "Last 30 days" while the stored window happens to be
// exactly that, so a preset reads back the way it was picked. Once it no longer
// matches (a day passes, or the dates are edited), it prints the dates instead —
// which is the honest label at that point.
export function matchedPreset(f = {}, now = new Date()) {
  if (!f.from || !f.to) return null;
  for (const p of DATE_PRESETS) {
    const r = presetRange(p.id, now);
    if (r.from === f.from && r.to === f.to) return p;
  }
  return null;
}

// The value half of a chip ("SMC +2", "≥ $100", "Last 30 days").
export function chipValue(def, f = {}, options = {}, now = new Date()) {
  if (def.type === 'date') {
    const preset = matchedPreset(f, now);
    if (preset) return preset.label;
    if (f.from && f.to) return `${shortDate(f.from)} – ${shortDate(f.to)}`;
    return f.from ? `from ${shortDate(f.from)}` : `until ${shortDate(f.to)}`;
  }
  if (def.type === 'range') {
    const { min, max } = f[def.id] || {};
    if (min != null && max != null) return `${bound(def, min)} – ${bound(def, max)}`;
    return min != null ? `≥ ${bound(def, min)}` : `≤ ${bound(def, max)}`;
  }
  const labelOf = (v) => valueOptions(def, options).find((o) => o.value === v)?.label ?? v;
  if (def.type === 'single') return labelOf(f[def.id]);
  const vals = f[def.id] || [];
  if (vals.length <= 2) return vals.map(labelOf).join(', ');
  return `${labelOf(vals[0])} +${vals.length - 1}`;
}

// ---- predicates -------------------------------------------------------------

const inRange = (v, { min, max } = {}) => {
  if (v == null || !Number.isFinite(Number(v))) return false;  // an unset column can't be in a range
  const n = Number(v);
  if (min != null && n < min) return false;
  if (max != null && n > max) return false;
  return true;
};

// Does one trade pass one def's value? Callers only ever hit this for ACTIVE defs.
export function matchesDef(def, trade, f = {}, ctx = {}) {
  if (def.type === 'date') {
    const c = Date.parse(trade.close_time);
    if (!Number.isFinite(c)) return false;
    if (f.from && c < Date.parse(`${f.from}T00:00:00`)) return false;
    if (f.to && c > Date.parse(`${f.to}T23:59:59`)) return false;
    return true;
  }
  const read = def.get ? def.get(trade, ctx) : null;
  if (def.type === 'range') return inRange(read, f[def.id]);
  if (def.type === 'single') return String(read ?? '') === f[def.id];
  return (f[def.id] || []).includes(read);
}

// ---- persistence ------------------------------------------------------------

export const emptyFilterState = () => {
  const out = { from: null, to: null };
  for (const def of FILTERS) {
    if (def.type === 'date' || def.soon) continue;
    out[def.id] = emptyValue(def);
  }
  return out;
};

const asDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const asNum = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Saved filter state is merged SHALLOWLY into the scope's config, so a blob
// written before a def existed arrives with that key missing entirely — and a
// blob written by a newer client can arrive with junk in it. Rebuild from the
// registry every read: known keys are coerced to their type, everything else is
// dropped. Never throws, never returns a half-shaped value.
export function sanitizeFilterState(saved) {
  const out = emptyFilterState();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
  out.from = asDay(saved.from);
  out.to = asDay(saved.to);
  // A reversed window would silently match nothing; treat it as unset.
  if (out.from && out.to && out.from > out.to) { out.from = null; out.to = null; }
  for (const def of FILTERS) {
    if (def.type === 'date' || def.soon) continue;
    const v = saved[def.id];
    if (def.type === 'multi') {
      if (!Array.isArray(v)) continue;
      const seen = new Set();
      out[def.id] = v.filter((x) => typeof x === 'string' && x !== '' && !seen.has(x) && seen.add(x));
    } else if (def.type === 'single') {
      const allowed = def.values?.map((o) => o.value);
      if (typeof v === 'string' && (!allowed || allowed.includes(v))) out[def.id] = v;
    } else if (def.type === 'range') {
      if (!v || typeof v !== 'object') continue;
      let min = asNum(v.min); let max = asNum(v.max);
      if (min != null && max != null && min > max) [min, max] = [max, min];
      out[def.id] = { min, max };
    }
  }
  return out;
}

// ---- query string -----------------------------------------------------------

// Ranges travel as one param, `min..max`, either side omittable — so a new range
// filter costs one query key instead of two.
export const rangeToParam = ({ min, max } = {}) => `${min ?? ''}..${max ?? ''}`;

export function filterStateToQuery(f = {}) {
  const p = new URLSearchParams();
  for (const def of activeDefs(f)) {
    if (def.type === 'date') continue;
    if (def.type === 'multi') p.set(def.query, f[def.id].join(','));
    else if (def.type === 'single') p.set(def.query, f[def.id]);
    else if (def.type === 'range') p.set(def.query, rangeToParam(f[def.id]));
  }
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  const s = p.toString();
  return s ? `&${s}` : '';
}
