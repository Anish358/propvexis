import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FILTERS, LIVE_FILTERS, FILTER_GROUPS, FILTER_BY_ID, DATE_PRESETS,
  activeDefs, chipValue, clearPatch, countActive, isActive, matchedPreset,
  presetRange, valueOptions, emptyFilterState, sanitizeFilterState, filterStateToQuery,
} from '../frontend/src/features/filters/filterDefs.js';
import { filterTrades, availableOptions, emptyFilters, sanitizeFilters } from '../frontend/src/features/filters/filters.js';
import { buildTradeWhere } from '../src/domain/analytics/aggregations.js';
import { sourceOf } from './helpers/backend-src.js';

import { appCss } from './helpers/app-css.js';
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const panel = read('../frontend/src/features/filters/FilterPanel.jsx');
const bar = read('../frontend/src/features/filters/FilterBar.jsx');
const app = read('../frontend/src/App.jsx');
const css = appCss;
// parseFilters and the routes that use it live in whichever module owns /api/stats
// (src/routes/analytics.js today) — resolved by route, not by path.
const server = sourceOf('get', '/api/stats');

const f = (patch) => ({ ...emptyFilters(), ...patch });

// A trade set wide enough that each filter type has something to bite on.
const T = [
  {
    id: 1, symbol: 'EURUSD.r', symbol_base: 'EURUSD', direction: 'buy', setup: 'SMC',
    session: 'LDN', probability: 'HIGH', mtf_phase: 'A', tagged: true, volume: 0.5,
    pnl_money: 250, fixed_r: 2, max_r: 3, sl_size_pips: 20,
    open_time: '2026-07-06T08:00:00Z', close_time: '2026-07-06T09:00:00Z',   // Monday, 60 min
  },
  {
    id: 2, symbol: 'GBPUSD', symbol_base: 'GBPUSD', direction: 'sell', setup: 'Continue',
    session: 'NY', probability: 'LOW', mtf_phase: 'B', tagged: false, volume: 1.5,
    pnl_money: -80, fixed_r: -1, max_r: 0.5, sl_size_pips: 45,
    open_time: '2026-07-10T13:00:00Z', close_time: '2026-07-10T13:15:00Z',  // Friday, 15 min
  },
  {
    id: 3, symbol: 'XAUUSD', symbol_base: 'XAUUSD', direction: 'buy', setup: 'Fractal',
    session: 'ASIA', probability: 'MED', mtf_phase: null, tagged: false, volume: null,
    pnl_money: 0, fixed_r: 0, max_r: null, sl_size_pips: null,
    open_time: '2026-07-15T02:00:00Z', close_time: '2026-07-15T06:00:00Z',  // Wednesday, 240 min
  },
];
const ids = (list) => list.map((t) => t.id);

// ---- registry integrity -----------------------------------------------------

test('every def is well formed and unique', () => {
  const seen = new Set();
  for (const d of FILTERS) {
    assert.ok(d.id && !seen.has(d.id), `duplicate or missing id: ${d.id}`);
    seen.add(d.id);
    assert.ok(d.label, `${d.id} needs a label`);
    assert.ok(['multi', 'single', 'range', 'date'].includes(d.type), `${d.id} has an unknown type`);
    // The Add-filter menu renders group by group, so a def outside the listed
    // groups would exist in the registry and appear nowhere in the UI.
    assert.ok(FILTER_GROUPS.some((g) => g.id === d.group), `${d.id} is in an unlisted group`);
    if (d.soon) continue;
    // A live def must be readable from a trade and serializable — otherwise it
    // shows up in the menu and then filters nothing.
    if (d.type !== 'date') {
      assert.equal(typeof d.get, 'function', `${d.id} needs a get()`);
      assert.ok(d.query, `${d.id} needs a query key`);
    }
    if (d.type === 'multi' || d.type === 'single') {
      assert.ok(d.values || d.optionsKey, `${d.id} needs values or an optionsKey`);
    }
  }
  const queries = LIVE_FILTERS.filter((d) => d.query).map((d) => d.query);
  assert.equal(new Set(queries).size, queries.length, 'query keys must be unique');
});

test('the registry spans all four interaction types', () => {
  // The point of the redesign: a long form can only express dropdowns, so each
  // type has to be genuinely in use or the panel silently regresses to one shape.
  for (const type of ['multi', 'single', 'range', 'date']) {
    assert.ok(LIVE_FILTERS.some((d) => d.type === type), `no live ${type} filter`);
  }
  assert.equal(FILTER_BY_ID.direction.type, 'single', 'Direction is a single-value choice');
  assert.equal(FILTER_BY_ID.setups.type, 'multi', 'Strategy is multi-select');
  for (const id of ['pnl', 'r', 'maxR', 'risk', 'dur', 'vol']) {
    assert.equal(FILTER_BY_ID[id].type, 'range', `${id} must be a min/max range, not a dropdown`);
  }
});

test('roadmap dimensions are listed but inert', () => {
  const soon = FILTERS.filter((d) => d.soon).map((d) => d.id);
  assert.ok(soon.length > 0, 'the growth path should be visible in the menu');
  for (const id of soon) {
    assert.equal(isActive(FILTER_BY_ID[id], { [id]: ['x'] }), false, `${id} must not filter anything yet`);
    assert.ok(!emptyFilterState()[id], `${id} must not take up state`);
  }
});

// ---- active / clear / count --------------------------------------------------

test('isActive reads each type, and empty means unfiltered', () => {
  assert.deepEqual(activeDefs(emptyFilters()), []);
  assert.equal(countActive(emptyFilters()), 0);
  assert.equal(isActive(FILTER_BY_ID.setups, f({ setups: [] })), false);
  assert.equal(isActive(FILTER_BY_ID.setups, f({ setups: ['SMC'] })), true);
  assert.equal(isActive(FILTER_BY_ID.direction, f({ direction: '' })), false);
  assert.equal(isActive(FILTER_BY_ID.direction, f({ direction: 'buy' })), true);
  assert.equal(isActive(FILTER_BY_ID.pnl, f({ pnl: { min: null, max: null } })), false);
  assert.equal(isActive(FILTER_BY_ID.pnl, f({ pnl: { min: 0, max: null } })), true, '0 is a bound, not absence');
  assert.equal(isActive(FILTER_BY_ID.date, f({ from: '2026-07-01' })), true);
});

test('the badge counts dimensions, not values', () => {
  assert.equal(countActive(f({ setups: ['SMC', 'ICT', 'Continue'] })), 1);
  assert.equal(countActive(f({ setups: ['SMC'], direction: 'buy', pnl: { min: 100, max: null }, from: '2026-07-01' })), 4);
});

test('a chip clears only its own filter', () => {
  const state = f({ setups: ['SMC'], direction: 'buy', from: '2026-07-01', to: '2026-07-31' });
  const after = { ...state, ...clearPatch(FILTER_BY_ID.setups) };
  assert.deepEqual(after.setups, []);
  assert.equal(after.direction, 'buy', 'removing Strategy must not touch Direction');
  assert.equal(after.from, '2026-07-01');
  // Date owns two keys, so its patch has to clear both or half the window sticks.
  assert.deepEqual(clearPatch(FILTER_BY_ID.date), { from: null, to: null });
});

// ---- chips ------------------------------------------------------------------

test('chip text summarises each type', () => {
  const opts = availableOptions(T);
  const val = (id, patch) => chipValue(FILTER_BY_ID[id], f(patch), opts, new Date('2026-07-28T12:00:00Z'));
  assert.equal(val('setups', { setups: ['SMC'] }), 'SMC');
  assert.equal(val('setups', { setups: ['SMC', 'Continue'] }), 'SMC, Continue');
  // Three or more would overflow the chip, so they collapse to a count.
  assert.equal(val('setups', { setups: ['SMC', 'Continue', 'Fractal'] }), 'SMC +2');
  // Static value lists print their LABEL, not the stored code.
  assert.equal(val('direction', { direction: 'buy' }), 'Buy');
  assert.equal(val('outcome', { outcome: ['win'] }), 'Winners');
  assert.equal(val('dows', { dows: ['1'] }), 'Monday');
  // Ranges read as comparisons; bounds are inclusive, so ≥ / ≤ rather than > / <.
  assert.equal(val('pnl', { pnl: { min: 100, max: null } }), '≥ $100');
  assert.equal(val('pnl', { pnl: { min: null, max: -50 } }), '≤ $-50');
  assert.equal(val('pnl', { pnl: { min: 100, max: 500 } }), '$100 – $500');
  assert.equal(val('r', { r: { min: 1.5, max: null } }), '≥ 1.5 R');
  assert.equal(val('dur', { dur: { min: null, max: 30 } }), '≤ 30 min');
});

test('a preset date range reads back by name while it still holds', () => {
  const now = new Date('2026-07-28T12:00:00Z');
  const r = presetRange('30d', now);
  assert.equal(r.to, '2026-07-28');
  assert.equal(r.from, '2026-06-29', '30 days INCLUDING today');
  assert.equal(chipValue(FILTER_BY_ID.date, f(r), {}, now), 'Last 30 days');
  // Nothing relative is stored, so once the window no longer IS the last 30 days
  // the chip stops claiming it is and prints the dates instead.
  assert.equal(matchedPreset(f(r), new Date('2026-07-29T12:00:00Z')), null);
  assert.equal(chipValue(FILTER_BY_ID.date, f(r), {}, new Date('2026-07-29T12:00:00Z')), 'Jun 29 – Jul 28');
  assert.equal(chipValue(FILTER_BY_ID.date, f({ from: '2026-07-01' }), {}, now), 'from Jul 1');
  assert.equal(chipValue(FILTER_BY_ID.date, f({ to: '2026-07-01' }), {}, now), 'until Jul 1');
  for (const p of DATE_PRESETS) {
    const range = presetRange(p.id, now);
    assert.ok(range.from && range.to, `${p.id} must produce concrete dates`);
    assert.ok(range.from <= range.to, `${p.id} range is inverted`);
  }
});

// ---- value lists ------------------------------------------------------------

test('dynamic value lists come from the trades in scope, static ones from the def', () => {
  const opts = availableOptions(T);
  assert.deepEqual(valueOptions(FILTER_BY_ID.symbols, opts).map((o) => o.value), ['EURUSD', 'GBPUSD', 'XAUUSD']);
  assert.deepEqual(valueOptions(FILTER_BY_ID.sessions, opts).map((o) => o.value), ['LDN', 'NY', 'ASIA']);
  assert.deepEqual(valueOptions(FILTER_BY_ID.probability, opts).map((o) => o.value), ['HIGH', 'MED', 'LOW']);
  // Null columns must not become a blank, unselectable row.
  assert.deepEqual(valueOptions(FILTER_BY_ID.mtf, opts).map((o) => o.value), ['A', 'B']);
  assert.deepEqual(valueOptions(FILTER_BY_ID.direction, opts).map((o) => o.value), ['buy', 'sell']);
  assert.equal(valueOptions(FILTER_BY_ID.dows, opts).length, 7);
});

// ---- filtering --------------------------------------------------------------

test('multi and single filters narrow as declared', () => {
  assert.deepEqual(ids(filterTrades(T, emptyFilters())), [1, 2, 3], 'no filters = everything');
  assert.deepEqual(ids(filterTrades(T, f({ setups: ['SMC', 'Fractal'] }))), [1, 3]);
  assert.deepEqual(ids(filterTrades(T, f({ symbols: ['EURUSD'] }))), [1], 'matches the BASE symbol');
  assert.deepEqual(ids(filterTrades(T, f({ direction: 'sell' }))), [2]);
  assert.deepEqual(ids(filterTrades(T, f({ mtf: ['A'] }))), [1]);
  assert.deepEqual(ids(filterTrades(T, f({ journaled: 'no' }))), [2, 3]);
  assert.deepEqual(ids(filterTrades(T, f({ dows: ['1', '5'] }))), [1, 2], 'Monday + Friday');
});

test('range filters bound both sides, and an unset column never matches', () => {
  assert.deepEqual(ids(filterTrades(T, f({ pnl: { min: 100, max: null } }))), [1]);
  assert.deepEqual(ids(filterTrades(T, f({ pnl: { min: null, max: 0 } }))), [2, 3]);
  assert.deepEqual(ids(filterTrades(T, f({ pnl: { min: -100, max: 100 } }))), [2, 3]);
  assert.deepEqual(ids(filterTrades(T, f({ r: { min: 0, max: null } }))), [1, 3], 'breakeven is inside [0, ∞)');
  assert.deepEqual(ids(filterTrades(T, f({ dur: { min: null, max: 60 } }))), [1, 2]);
  assert.deepEqual(ids(filterTrades(T, f({ dur: { min: 120, max: null } }))), [3]);
  // Trade 3 has no max_r / sl_size_pips / volume: a missing measurement can't be
  // asserted to be inside a range, so it drops out rather than counting as 0.
  assert.deepEqual(ids(filterTrades(T, f({ maxR: { min: null, max: 10 } }))), [1, 2]);
  assert.deepEqual(ids(filterTrades(T, f({ risk: { min: 0, max: null } }))), [1, 2]);
  assert.deepEqual(ids(filterTrades(T, f({ vol: { min: 0, max: null } }))), [1, 2]);
});

test('outcome is classified in the active unit', () => {
  assert.deepEqual(ids(filterTrades(T, f({ outcome: ['win'] }), 'R')), [1]);
  assert.deepEqual(ids(filterTrades(T, f({ outcome: ['loss'] }), 'R')), [2]);
  assert.deepEqual(ids(filterTrades(T, f({ outcome: ['be'] }), 'R')), [3]);
  assert.deepEqual(ids(filterTrades(T, f({ outcome: ['win', 'be'] }), 'USD')), [1, 3]);
});

test('the date window is inclusive at both ends', () => {
  assert.deepEqual(ids(filterTrades(T, f({ from: '2026-07-10', to: '2026-07-10' }))), [2]);
  assert.deepEqual(ids(filterTrades(T, f({ from: '2026-07-10' }))), [2, 3]);
  assert.deepEqual(ids(filterTrades(T, f({ to: '2026-07-06' }))), [1]);
});

test('filters compose — every active dimension must pass', () => {
  const state = f({ direction: 'buy', pnl: { min: 1, max: null }, dows: ['1'] });
  assert.deepEqual(ids(filterTrades(T, state)), [1]);
  // Adding one more dimension that trade 1 fails empties the result.
  assert.deepEqual(ids(filterTrades(T, { ...state, sessions: ['NY'] })), []);
});

// ---- persistence ------------------------------------------------------------

test('empty state covers every live filter and nothing else', () => {
  const e = emptyFilterState();
  for (const d of LIVE_FILTERS) {
    if (d.type === 'date') continue;
    assert.ok(d.id in e, `${d.id} missing from the empty state`);
  }
  assert.equal(e.from, null);
  assert.equal(e.to, null);
  assert.equal(countActive(e), 0);
});

test('a config saved before these filters existed still loads', () => {
  // The real shape persisted by the previous version — no direction, no ranges.
  const legacy = { setups: ['SMC'], symbols: [], sessions: [], probability: [], outcome: ['win'], from: '2026-07-01', to: null };
  const s = sanitizeFilters(legacy);
  assert.deepEqual(s.setups, ['SMC'], 'the saved values must survive');
  assert.equal(s.outcome[0], 'win');
  assert.equal(s.from, '2026-07-01');
  assert.deepEqual(s.pnl, { min: null, max: null }, 'the new keys arrive shaped, not undefined');
  assert.equal(s.direction, '');
  assert.equal(countActive(s), 3);
  // And it stays usable: filtering a trade list must not throw on the gaps.
  assert.deepEqual(ids(filterTrades(T, s)), [1]);
});

test('sanitize is fail-safe on junk', () => {
  for (const junk of [null, undefined, 'x', 42, [], true]) {
    assert.deepEqual(sanitizeFilterState(junk), emptyFilterState(), `${JSON.stringify(junk)} should fall back`);
  }
  const s = sanitizeFilterState({
    setups: 'SMC',                       // not an array
    symbols: ['EURUSD', 'EURUSD', 7],    // dupes + a non-string
    direction: 'sideways',               // outside the value list
    journaled: 'yes',
    pnl: { min: '100', max: 'abc' },     // numeric strings / garbage
    r: { min: 5, max: 1 },               // reversed
    dur: 'nope',
    from: '07/01/2026',                  // wrong format
    to: '2026-07-31',
  });
  assert.deepEqual(s.setups, []);
  assert.deepEqual(s.symbols, ['EURUSD']);
  assert.equal(s.direction, '', 'an unknown enum value must not persist');
  assert.equal(s.journaled, 'yes');
  assert.deepEqual(s.pnl, { min: 100, max: null });
  assert.deepEqual(s.r, { min: 1, max: 5 }, 'reversed bounds are read in the order meant');
  assert.deepEqual(s.dur, { min: null, max: null });
  assert.equal(s.from, null);
  assert.equal(s.to, '2026-07-31');
});

test('a reversed date window is treated as unset, not as "match nothing"', () => {
  const s = sanitizeFilterState({ from: '2026-07-31', to: '2026-07-01' });
  assert.equal(s.from, null);
  assert.equal(s.to, null);
});

// ---- client ⇄ server parity -------------------------------------------------

test('every live filter serializes to the query string', () => {
  const q = filterStateToQuery(f({
    setups: ['SMC', 'Continue'], direction: 'buy', journaled: 'no',
    pnl: { min: 100, max: 500 }, r: { min: null, max: -1 }, dows: ['1', '5'],
    from: '2026-07-01', to: '2026-07-31',
  }));
  const p = new URLSearchParams(q.slice(1));
  assert.equal(p.get('setups'), 'SMC,Continue');
  assert.equal(p.get('direction'), 'buy');
  assert.equal(p.get('journaled'), 'no');
  assert.equal(p.get('pnl'), '100..500');
  assert.equal(p.get('r'), '..-1');
  assert.equal(p.get('dows'), '1,5');
  assert.equal(p.get('from'), '2026-07-01');
  assert.equal(filterStateToQuery(emptyFilters()), '', 'no filters = no params');
  // Inactive dimensions must not travel — an empty param would defeat the
  // backend's "absent = unfiltered" reading.
  assert.equal(new URLSearchParams(filterStateToQuery(f({ setups: ['SMC'] })).slice(1)).get('symbols'), null);
});

test('the server parses every query key the client can send', () => {
  const parsed = server.slice(server.indexOf('const parseFilters'), server.indexOf('app.get(\'/api/stats\''));
  for (const d of LIVE_FILTERS) {
    if (!d.query) continue;
    assert.ok(parsed.includes(`q.${d.query}`), `parseFilters ignores ${d.query} — the server would return unfiltered stats`);
  }
});

test('the server applies every live filter in SQL', () => {
  // The stats endpoints are the other half of the same filter set: if a dimension
  // is only honoured client-side, the KPI cards disagree with the trade table.
  const state = f({
    setups: ['SMC'], symbols: ['EURUSD'], sessions: ['LDN'], probability: ['HIGH'],
    mtf: ['A'], dows: ['1'], direction: 'buy', journaled: 'yes', outcome: ['win'],
    pnl: { min: 100, max: 500 }, r: { min: 1, max: null }, maxR: { min: null, max: 5 },
    risk: { min: 10, max: 50 }, vol: { min: 0.1, max: 2 }, dur: { min: 5, max: 240 },
    from: '2026-07-01', to: '2026-07-31',
  });
  const { where, params } = buildTradeWhere(null, 'R', state, null, false);
  const expect = {
    setups: 'setup', symbols: 'COALESCE(symbol_base, symbol)', sessions: 'session',
    probability: 'probability', mtf: 'mtf_phase', dows: 'ISODOW', direction: 'direction',
    journaled: 'tagged', pnl: 'pnl_money', r: 'fixed_r', maxR: 'max_r', risk: 'sl_size_pips',
    // Outcome goes through the shared outcomeSql() CASE rather than restating the
    // win/loss test, so a filter can't disagree with an aggregate about a win.
    vol: 'volume', dur: 'EXTRACT(EPOCH', outcome: "THEN 'win'", date: 'close_time >=',
  };
  for (const d of LIVE_FILTERS) {
    assert.ok(expect[d.id], `no SQL expectation registered for ${d.id} — add one`);
    assert.ok(where.includes(expect[d.id]), `${d.id} is not applied in SQL (looked for ${expect[d.id]})`);
  }
  // Every user value is a parameter, never inlined.
  assert.ok(params.includes(100) && params.includes(500), 'range bounds must be parameterized');
  assert.ok(!where.includes('SMC') && !where.includes('EURUSD'), 'no value may be inlined into SQL');
  assert.ok(where.includes('$1'), 'placeholders, not literals');
  // Nothing active = no WHERE at all.
  assert.equal(buildTradeWhere(null, 'R', emptyFilters(), null, false).where, '');
});

test('the weekday filter reads UTC on both sides', () => {
  // The stats layer extracts every timestamp part AT TIME ZONE 'UTC', so the
  // weekday a trade is FILTERED by has to be the weekday it is GROUPED under.
  // Reading the client side in local time would split a Monday-evening UTC trade
  // into Tuesday for anyone east of UTC — the trade table and the KPI cards would
  // then disagree, silently, only for some users.
  const { where } = buildTradeWhere(null, 'R', f({ dows: ['1'] }), null, false);
  assert.match(where, /ISODOW FROM \(close_time AT TIME ZONE 'UTC'\)/);
  assert.match(read('../frontend/src/features/filters/filterDefs.js'), /d\.getUTCDay\(\)/);
  // 2026-07-06T23:30Z is Monday in UTC and Tuesday at UTC+5:30 — it must filter
  // as Monday wherever this runs.
  const lateMonday = { close_time: '2026-07-06T23:30:00Z', open_time: '2026-07-06T23:00:00Z' };
  assert.equal(filterTrades([lateMonday], f({ dows: ['1'] })).length, 1);
  assert.equal(filterTrades([lateMonday], f({ dows: ['2'] })).length, 0);
});

test('a range with one open side only constrains that side', () => {
  const { where } = buildTradeWhere(null, 'R', f({ pnl: { min: 100, max: null } }), null, false);
  assert.ok(where.includes('pnl_money >='));
  assert.ok(!where.includes('pnl_money <='));
});

// ---- panel structure --------------------------------------------------------

test('the panel starts from Add filter and chips, not a stack of dropdowns', () => {
  assert.match(panel, /Add filter/);
  assert.match(panel, /className="fp-chips"/);
  assert.match(panel, /className="fp-chip-x"/);
  // The old shape: one hard-coded control per dimension in the top bar.
  assert.ok(!bar.includes('MultiSelect'), 'the fixed dropdown stack must be gone');
  assert.ok(!bar.includes('tb-filters-grid'), 'the fixed filter form must be gone');
  assert.ok(!css.includes('.tb-filters-grid'), 'dead form CSS should go with it');
  assert.ok(!css.includes('.fb-ms-btn'), 'dead multiselect CSS should go with it');
  // Nothing in the panel names an individual filter — it renders the registry, so
  // a new dimension needs no change here. (Date/range EDITORS are keyed off the
  // type, and `from`/`to` are that type's two state keys.)
  const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  for (const id of LIVE_FILTERS.filter((d) => d.type !== 'date').map((d) => d.id)) {
    assert.ok(!new RegExp(`['"\`]${id}['"\`]`).test(code), `FilterPanel hard-codes the ${id} filter`);
  }
});

test('the button, its position and the top bar are untouched', () => {
  // Explicitly out of scope for this redesign: only what opens BELOW the button
  // changed. The button keeps its funnel icon, label, badge and place in the
  // right-hand control cluster.
  //
  // REWRITTEN 2026-08-05 (Phase 4c) and the test's POINT is unchanged, which is worth
  // being precise about. Three of these assertions named the button's legacy classes
  // (`tb-btn`, `tb-badge`, `fb-unit`) as a way of saying "the button still looks and sits
  // where it did". Phase 4c replaced those classes with components — a change of
  // implementation, not of icon, label, badge or order — so the assertions are restated
  // against what is durable. Anything pinned to a class name was pinning the migration's
  // starting point rather than the requirement.
  assert.match(bar, /variant="chrome" size="sm" active=\{active > 0\}/, 'still a quiet control that brightens when engaged');
  assert.match(bar, /<Filter aria-hidden="true" \/>/, 'still a funnel icon');
  assert.match(bar, /<span>Filters<\/span>/);
  assert.match(bar, /\{active > 0 && <CountBadge>\{active\}<\/CountBadge>\}/, 'still a count badge');
  // Order in the right-hand cluster: after the unit switch, before the account switcher.
  assert.ok(bar.indexOf('<FiltersButton') > bar.indexOf('<ToggleGroupExclusive'));
  assert.ok(bar.indexOf('<FiltersButton') < bar.indexOf('<AccountSwitcher'));
  assert.match(css, /\.tb-filters \{ position: relative; \}/);
});

test('columns open beside each other instead of replacing one another', () => {
  // Both menus are mounted at once — the choose column stays on screen while the
  // value column is open, which is the whole point of the cascade.
  assert.match(panel, /\{adding && \(\s*<Menu/);
  assert.match(panel, /\{def && \(\s*<Menu/);
  assert.match(panel, /const openDef = \(id, el\) => \{ setAdding\(true\); setPickedId\(id\); anchorFrom\(el\); \}/);
  // Within the cascade they run right-to-left, growing leftward from a button
  // that sits at the right edge of the bar.
  assert.match(css, /\.fp-cascade \{[^}]*flex-direction: row-reverse/);
  assert.match(css, /\.fp-stack \{[\s\S]*?right: 0/);
  // Too narrow for two columns → stack them instead of overflowing the viewport.
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.fp-cascade \{ flex-direction: column;/);
});

test('the cascade hangs below the panel, not alongside it', () => {
  // Otherwise a long filter list runs up beside the top bar and covers the page
  // header. The panel is the anchor: it stays put under the button and the
  // columns drop beneath it, right-aligned with it.
  assert.match(css, /\.fp-stack \{[\s\S]*?flex-direction: column; align-items: flex-end/);
  const both = panel.indexOf('className="fp-cascade"');
  assert.ok(both > panel.indexOf('className="fp-add"'), 'the cascade renders after the panel body');
  assert.ok(both < panel.indexOf('title="Add filter"'), 'both menus live inside the cascade row');
  assert.match(panel, /\{\(adding \|\| def\) && \(/, 'no empty cascade row when nothing is open');
  // The columns start lower now, so their height has to be capped against the
  // viewport rather than a fixed pixel value.
  assert.match(css, /\.fp-menu \{[\s\S]*?max-height: min\(\d+vh,/);
});

test('hovering a filter opens its values — no click needed', () => {
  assert.match(panel, /onHover=\{\(row, el\) => \{ setPickedId\(row\.id\); anchorFrom\(el\); \}\}/);
  assert.match(panel, /onMouseEnter=\{\(e\) => \{[\s\S]*?hoverOpen\(row, e\.currentTarget\);/);
  assert.match(panel, /onMouseLeave=\{cancelHover\}/);
  // Sweeping the pointer down the list must not fire a column open per row.
  assert.match(panel, /hoverTimer\.current = setTimeout\(\(\) => onHover\(row, el\), 60\)/);
  assert.match(panel, /clearTimeout\(hoverTimer\.current\)/);
  // Roadmap rows open nothing, and the keyboard stays quiet: only the choose
  // column passes onHover, and arrowing only moves the highlight.
  assert.match(panel, /if \(!onHover \|\| row\.soon\) return;/);
  const valueMenu = panel.slice(panel.indexOf('{def && ('));
  assert.ok(!valueMenu.includes('onHover'), 'hovering a value must not select it');
});

test('the values column opens level with the row that spawned it', () => {
  // Anchored to the row, not to the top of the panel — otherwise a filter near the
  // bottom of the list opens a column that appears unrelated to it.
  assert.match(css, /\.fp-cascade \{ position: relative;/);
  assert.match(css, /\.fp-menu--values \{ position: absolute; top: 0; right: calc\(100% \+ var\(--s-2\)\); \}/);
  assert.match(panel, /style=\{valuesTop == null \? undefined : \{ top: `\$\{valuesTop\}px` \}\}/);
  // The offset lands the column's FIRST ROW against the parent row, and the lead
  // is measured so tuning the header/search padding can't break the alignment.
  assert.match(panel, /const first = el\.querySelector\('\.fp-row, \.fp-range, \.fp-date'\);/);
  assert.match(panel, /const lead = first \? first\.getBoundingClientRect\(\)\.top - box\.top : 0;/);
  assert.match(panel, /anchorTop - lead/);
  // Measured before paint, or the column visibly jumps up from the cascade's top.
  assert.match(panel, /useLayoutEffect\(\(\) => \{/);
  // Clamped so a row near the viewport edge can't push the column off-screen.
  assert.match(panel, /window\.innerHeight - 8 - el\.offsetHeight - cTop/);
  // Both the pointer and the keyboard hand over an anchor row.
  assert.match(panel, /onPick\(pickable\[cursor\], bodyRef\.current\?\.querySelector\('\.is-cursor'\)\)/);
  // Stacked layout puts it back in flow, where an inline `top` is inert.
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.fp-menu--values \{ position: static; \}/);
});

test('menu rows use the default cursor, buttons keep the pointer', () => {
  // A hand on every row of a list this long makes pointing at things flicker; the
  // highlight is what marks the live row. Chips / Add filter / Clear are real
  // buttons and must still say so.
  assert.match(css, /\.fp-row \{[^}]*cursor: default;/);
  assert.match(css, /\.fp-preset \{[^}]*cursor: default;/);
  for (const sel of ['.fp-add', '.fp-chip-main', '.fp-chip-x', '.fp-menu-clear', '.fp-head-clear']) {
    const rule = css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    assert.match(rule, /cursor: pointer/, `${sel} is a button and should keep the pointer`);
  }
});

test('pointing at a tick box lights it', () => {
  assert.match(css, /\.fp-box:hover \{ border-color: var\(--accent-border-strong\); box-shadow: 0 0 0 3px var\(--accent-bg\); \}/);
  // Transitioned, so it reads as a light rather than a snap.
  assert.match(css, /\.fp-box \{[\s\S]*?transition:[^;]*border-color[^;]*box-shadow/);
});

test('an opening column does not look like something in it is selected', () => {
  // The search field is focused as the column opens — that is what makes
  // type-to-filter work — so an accent focus ring would paint every fresh column
  // as though a value were already chosen. Focus shows as the caret plus a firmer
  // border, not a blue ring.
  assert.match(css, /\.fp-search:focus \{ outline: none; border-color: var\(--line-strong\); \}/);
  const search = css.slice(css.indexOf('.fp-search {'), css.indexOf('.fp-menu-body'));
  assert.ok(!/var\(--accent/.test(search), 'no accent ring on the search field');
  // Focus itself must stay, or typing and the arrow keys go nowhere.
  assert.match(panel, /searchRef\.current\?\.focus\(\)/);
});

test('a column names itself exactly once', () => {
  // List columns say it in the search placeholder and render NO heading; range and
  // date columns have no search box, so they keep the heading instead. Either way
  // the column is labelled, and never labelled twice.
  assert.match(panel, /title=\{valueItems \? undefined : def\.label\}/);
  assert.match(panel, /\{title && \(\s*<div className="fp-menu-head">/);
  assert.match(panel, /placeholder=\{`Search \$\{def\.label\.toLowerCase\(\)\}…`\}/);
  // The choose column keeps its heading — it has no filter name to repeat.
  assert.match(panel, /title="Add filter"/);
  // With the visible heading gone, the name has to reach a screen reader anyway.
  assert.match(panel, /ariaLabel=\{def\.label\}/);
  assert.match(panel, /aria-label=\{ariaLabel\}/);
  // The dropped subtitle's styling goes with it rather than lingering as dead CSS.
  assert.ok(!css.includes('.fp-menu-sub'), 'dead .fp-menu-sub rule left behind');
  assert.ok(!panel.includes('selectedCount'), 'dead selectedCount left behind');
});

test('the tick box shows on the hovered row, and wherever it is ticked', () => {
  // A box on every row is decoration; a box on the row you're about to act on is
  // an affordance. But a TICKED box must always show — hiding it would hide the
  // selection. Opacity, not display, so revealing one doesn't shift the label.
  assert.match(css, /\.fp-box \{[^}]*opacity: 0;/);
  assert.match(css, /\.fp-row\.is-cursor \.fp-box, \.fp-box\.is-on \{ opacity: 1; \}/);
  const box = css.slice(css.indexOf('.fp-box {'), css.indexOf('.fp-menu-foot'));
  assert.ok(!/display:\s*none/.test(box), 'display:none would reflow the row on hover');
});

test('every list column is searchable and keyboard-drivable', () => {
  assert.match(panel, /placeholder="Search filters…"/);
  assert.match(panel, /placeholder=\{`Search \$\{def\.label\.toLowerCase\(\)\}…`\}/);
  // Search filters the rows it renders, live — no apply step.
  assert.match(panel, /const kept = items\.filter/);
  // Command-palette keys: focus stays in the search box, the highlight is virtual.
  assert.match(panel, /aria-activedescendant=\{activeId\}/);
  assert.match(panel, /e\.key === 'ArrowDown'/);
  assert.match(panel, /e\.key === 'Enter'/);
  // Backspace on an empty search steps back a column.
  assert.match(panel, /e\.key === 'Backspace' && !q && onBack/);
});

test('Escape unwinds one column at a time, from anywhere in the panel', () => {
  // On the document, not the panel's tree: the range and date columns have no
  // search box holding focus, so a React-tree handler would miss them.
  assert.match(panel, /document\.addEventListener\('keydown', onKey\)/);
  assert.match(panel, /document\.removeEventListener\('keydown', onKey\)/);
  const unwind = panel.slice(panel.indexOf("if (e.key !== 'Escape') return;"), panel.indexOf('document.addEventListener'));
  assert.match(unwind, /if \(pickedId\) closeValues\(\);/);
  assert.match(unwind, /else if \(adding && chips\.length\) setAdding\(false\);/);
  assert.match(unwind, /else onClose\?\.\(\);/);
});

test('multi-select stays open, single-value commits and closes', () => {
  const pick = panel.slice(panel.indexOf('const pickValue'), panel.indexOf('return (', panel.indexOf('const pickValue')));
  assert.match(pick, /cur\.includes\(row\.id\) \? cur\.filter/, 'multi toggles a value');
  assert.ok(!/closeValues\(\)/.test(pick.slice(0, pick.indexOf('// Single-value'))), 'a checkbox must not close the column');
  assert.match(pick, /\/\/ Single-value[\s\S]*closeValues\(\)/);
  // Checkbox vs radio is chosen by type, not per filter.
  assert.match(panel, /box: def\.type === 'multi' \? 'check' : 'radio'/);
  assert.match(css, /\.fp-box--radio \{ border-radius: var\(--r-full\); \}/);
});

test('numeric filters render Minimum/Maximum inputs', () => {
  assert.match(panel, /\['min', 'Minimum'\], \['max', 'Maximum'\]/);
  assert.match(panel, /type="number"/);
  // Typing is buffered so a half-entered value ("-", "1.") never reaches state.
  assert.match(panel, /s === '' \|\| s === '-'/);
  assert.match(panel, /Minimum is above maximum/);
  // …but a value cleared from OUTSIDE the inputs (the column's Clear, Clear all)
  // has to empty them, or the boxes keep showing a filter that no longer applies.
  assert.match(panel, /if \(parse\(draft\.min\) === \(value\?\.min \?\? null\) && parse\(draft\.max\) === \(value\?\.max \?\? null\)\) return;/);
});

test('the date picker is unchanged, and only appears once Date is picked', () => {
  assert.match(panel, /type="date"/);
  assert.match(panel, /def\.type === 'date' && <DateBody/);
  // Not rendered anywhere else — no date inputs sitting in the panel by default.
  assert.ok(!/type="date"/.test(bar), 'the top bar must no longer hold date inputs');
});

test('panel state is sanitized on read and on write', () => {
  assert.match(app, /const filters = sanitizeFilters\(config\.filters\)/);
  assert.match(app, /filters: \{ \.\.\.sanitizeFilters\(c\.filters\), \.\.\.p \}/);
});

test('every column is exactly as wide as the panel above it', () => {
  // They stack vertically and share an edge, so a few px of difference reads as a
  // mistake rather than as hierarchy. One declared width, two consumers — two
  // literals would drift the moment either is tuned.
  assert.match(css, /\.fp-stack \{[\s\S]*?--fp-w: \d+px;/);
  assert.match(css, /\.fp \{\s*width: var\(--fp-w\)/);
  assert.match(css, /\.fp-menu \{[\s\S]*?width: var\(--fp-w\)/);
  // [^}] confines the search to each rule's own body — a lazy [\s\S]*? would run
  // past the closing brace and match some later rule's width instead.
  const literals = [...css.matchAll(/\.fp(?:-menu)? \{[^}]*width:\s*(\d+px)/g)].map((m) => m[1]);
  assert.deepEqual(literals, [], 'a column must not hard-code its own width');
});

test('the panel styling stays inside the design language', () => {
  const block = css.slice(css.indexOf('/* ---- Filter panel'), css.indexOf('/* Right action cluster'));
  assert.ok(block.length > 500, 'could not locate the filter panel CSS block');
  // Selected chrome is grayscale here, as everywhere else — accent is reserved for
  // primary actions and data. (Focus rings and text-only clear links excepted.)
  const tinted = block.split('\n').filter((l) => /background:\s*var\(--accent/.test(l));
  assert.deepEqual(tinted, [], `selected states must use --sel-bg, not an accent tint:\n${tinted.join('\n')}`);
  // Weight ceiling: the panel is chrome, so nothing above 600 and no bold literal.
  assert.ok(!/font-weight:\s*(700|800|bold)/.test(block), 'no bold in the UI layer');
  // Radii come from the scale rather than ad-hoc pixel values.
  const radii = [...block.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  const offRamp = radii.filter((r) => !r.startsWith('var(--r-') && r !== '3px');
  assert.deepEqual(offRamp, [], `off-scale radii: ${offRamp.join(', ')}`);
});
