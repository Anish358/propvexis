import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appCss } from './helpers/app-css.js';
import { createLayoutModel, moveId, moveIdBefore } from '../frontend/src/layoutModel.js';
import {
  PROP_SECTIONS, PROP_KPIS, PROP_MAIN_WIDGETS, PROP_LABEL, PROP_DEFAULT_HIDDEN,
  defaultPropLayout, sanitizePropLayout, isDefaultPropLayout,
  isPropVisible, visiblePropIds, visiblePropSections, hiddenPropWidgets,
} from '../frontend/src/propLayout.js';
import { defaultDashLayout, sanitizeDashLayout } from '../frontend/src/dashLayout.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const prop = read('../frontend/src/PropOS.jsx');
const brief = read('../frontend/src/PropBrief.jsx');
const cards = read('../frontend/src/PropKpiCards.jsx');
const filter = read('../frontend/src/PropKpiFilter.jsx');
const app = read('../frontend/src/App.jsx');
const layoutJsx = read('../frontend/src/Layout.jsx');
const api = read('../frontend/src/api.js');

// ---- the shared engine -----------------------------------------------------

test('one engine backs both layouts, so persistence logic exists once', () => {
  // The Dashboard and the Overview need identical machinery over different
  // catalogues. A second copy would drift the first time either page was touched.
  const dashSrc = read('../frontend/src/dashLayout.js');
  const propSrc = read('../frontend/src/propLayout.js');
  for (const [name, src] of [['dashLayout', dashSrc], ['propLayout', propSrc]]) {
    assert.match(src, /from '\.\/layoutModel\.js'/, `${name} should build on the shared engine`);
    // The catalogue is all either file should own.
    assert.ok(!/function sanitize\w*Layout\s*\(/.test(src), `${name} must not re-implement sanitize`);
  }
});

test('the dashboard layout is behaviour-identical after the extraction', () => {
  const d = defaultDashLayout();
  assert.deepEqual(d.sections, ['brief', 'kpis', 'main']);
  assert.deepEqual(d.kpis, ['netPnl', 'tradeWin', 'profitFactor', 'dayWin', 'avgWinLoss']);
  assert.deepEqual(d.main, ['account', 'calendar', 'activity', 'cumulative']);
  assert.deepEqual(d.hidden, {}, 'the dashboard ships nothing hidden');
  assert.deepEqual(sanitizeDashLayout(null), d);
});

test('a model with no defaultHidden behaves exactly as before', () => {
  const m = createLayoutModel({
    sections: [{ id: 's1', label: 'S1' }],
    kpis: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    main: [{ id: 'w', label: 'W', size: 'large' }],
    columns: 3,
  });
  assert.deepEqual(m.defaultLayout().hidden, {});
  assert.equal(m.isDefaultLayout(undefined), true);
  assert.deepEqual(m.widgetSpan('w'), { cols: 2, rows: 2 });
  assert.deepEqual(m.widgetSpan('unknown'), { cols: 1, rows: 1 }, 'unknown ids fall back, never throw');
  assert.equal(m.COLUMNS, 3);
});

test('reorder helpers are shared and unchanged', () => {
  const l = ['a', 'b', 'c'];
  assert.deepEqual(moveId(l, 0, 2), ['b', 'c', 'a']);
  assert.equal(moveId(l, 1, 1), l, 'no-op moves stay identity-stable');
  assert.deepEqual(moveIdBefore(l, 'a', 'c'), ['b', 'c', 'a']);
  assert.equal(moveIdBefore(l, 'zz', 'a'), l);
});

// ---- the prop catalogue ----------------------------------------------------

test('the Overview ships the six business KPIs, five of them on', () => {
  assert.deepEqual(PROP_KPIS.map((k) => k.id), [
    'totalEarned', 'activeAccounts', 'totalFunding', 'evalSuccess', 'monthlyPayout', 'monthlyFees',
  ]);
  const l = defaultPropLayout();
  assert.deepEqual(visiblePropIds(l, 'kpis'), [
    'totalEarned', 'activeAccounts', 'totalFunding', 'evalSuccess', 'monthlyPayout',
  ]);
  assert.deepEqual(PROP_DEFAULT_HIDDEN, ['monthlyFees']);
  assert.equal(isPropVisible(l, 'monthlyFees'), false);
  for (const w of [...PROP_SECTIONS, ...PROP_KPIS]) {
    assert.equal(PROP_LABEL[w.id], w.label, `${w.id} label mismatch`);
  }
});

test('the content grid ships with its renderers, not before them', () => {
  // A widget in the catalogue with no renderer drags around the editor fine and
  // renders as an invisible hole, so the two always land in the same change.
  assert.deepEqual(PROP_MAIN_WIDGETS, []);
  assert.ok(!PROP_SECTIONS.some((s) => s.id === 'main'), 'no main section without widgets');
  assert.deepEqual(visiblePropSections(defaultPropLayout()), ['brief', 'kpis']);
});

test('an opt-in card the user turns ON stays on across loads', () => {
  // This is the whole reason defaultHidden seeds the DEFAULT only. Re-applying it
  // in sanitize would silently undo the user's choice on every page load.
  const turnedOn = sanitizePropLayout({ ...defaultPropLayout(), hidden: {} });
  assert.equal(isPropVisible(turnedOn, 'monthlyFees'), true);
  assert.deepEqual(visiblePropIds(turnedOn, 'kpis'), PROP_KPIS.map((k) => k.id));
});

test('a layout with no hidden map at all falls back to the shipped defaults', () => {
  // An older save, or a partial object — must not reveal the opt-in card.
  for (const junk of [null, undefined, 'x', 42, []]) {
    assert.equal(isPropVisible(sanitizePropLayout(junk), 'monthlyFees'), false, `${JSON.stringify(junk)}`);
  }
  assert.equal(isPropVisible(sanitizePropLayout({ kpis: ['totalEarned'] }), 'monthlyFees'), false);
});

test('Reset is offered only when the layout differs from the shipped default', () => {
  assert.equal(isDefaultPropLayout(defaultPropLayout()), true);
  assert.equal(isDefaultPropLayout(undefined), true, 'an unsaved layout is the default');
  // Revealing the opt-in card is a difference...
  assert.equal(isDefaultPropLayout(sanitizePropLayout({ hidden: {} })), false);
  // ...and so is hiding a shipped-on one.
  assert.equal(isDefaultPropLayout(sanitizePropLayout({ hidden: { monthlyFees: true, totalEarned: true } })), false);
  assert.match(filter, /disabled=\{isDefaultPropLayout\(layout\)\}/);
});

test('hidden KPIs are enumerable so the filter can offer them back', () => {
  const tray = hiddenPropWidgets(defaultPropLayout());
  assert.deepEqual(tray.map((w) => w.id), ['monthlyFees']);
  assert.equal(tray[0].zone, 'kpis');
  assert.ok(tray[0].label);
});

test('the KPI section disappears rather than leaving a bare gap', () => {
  const allOff = sanitizePropLayout({
    hidden: Object.fromEntries(PROP_KPIS.map((k) => [k.id, true])),
  });
  assert.deepEqual(visiblePropSections(allOff), ['brief']);
});

// ---- the page --------------------------------------------------------------

test('the Overview renders from the layout, not a hardcoded order', () => {
  assert.match(prop, /visiblePropSections\(layout\)/);
  assert.match(prop, /visiblePropIds\(layout, 'kpis'\)/);
  assert.match(prop, /sections\.map/);
  assert.match(prop, /visibleKpis\.map/);
  // Every catalogue id has a renderer, or it would be an invisible hole.
  for (const id of PROP_KPIS.map((k) => k.id)) {
    assert.match(prop, new RegExp(`\\b${id}: \\(\\) =>`), `kpiCard is missing ${id}`);
  }
  for (const id of PROP_SECTIONS.map((s) => s.id)) {
    assert.match(prop, new RegExp(`\\b${id}: \\(\\) =>`), `sectionNode is missing ${id}`);
  }
});

test('the Overview is portfolio-wide: it never passes an account id', () => {
  assert.match(api, /export async function fetchPropOverview\(\) \{/);
  assert.match(api, /getJson\('\/api\/prop\/overview'\)/);
  // No acctq() on this call, and no refetch when the selected account changes —
  // the business view spans every account by design.
  assert.doesNotMatch(api, /prop\/overview[^\n]*acctq/);
  assert.match(prop, /fetchPropOverview\(\)/);
  assert.match(prop, /useEffect\(\(\) => \{ load\(\); \}, \[\]\);/);
  assert.doesNotMatch(prop, /fetchPropOverview\(accountId\)/);
});

test('the old per-account Overview is gone, and what it owned went somewhere', () => {
  // The health gauges and drawdown meters were already duplicated on the
  // Dashboard's account card; rule editing lives in the accounts modal.
  for (const dead of ['HealthGauge', 'PortfolioCard', 'AccountDetail', 'ChallengeControls', 'MiniBar']) {
    assert.ok(!prop.includes(dead), `${dead} should have been removed from the Overview`);
  }
  // But the two helpers the Dashboard imports must survive the deletion.
  assert.match(prop, /export function roomStatus/);
  assert.match(prop, /export function healthStatus/);
  const dash = read('../frontend/src/Dashboard.jsx');
  assert.match(dash, /import \{ roomStatus, healthStatus \} from '\.\/PropOS\.jsx'/);
  // Finance is a separate page and is untouched by the Overview rebuild.
  assert.match(prop, /export function PropFinance/);
});

test('business KPI cards borrow the locked geometry instead of redefining it', () => {
  // Net P&L is the master card: every KPI tile matches its dimensions, and the
  // content adapts to the container rather than the container growing to fit.
  const tiles = cards.match(/className="dash-stat[^"]*"/g) || [];
  assert.ok(tiles.length >= 1, 'cards should render the shared KPI box');
  for (const t of tiles) assert.match(t, /dash-stat--typo-match/);
  assert.match(cards, /spacing="none"/);
  assert.match(cards, /import \{ Card \} from '@\/components\/primitives'/);
  // No geometry of its own — that is what drifts.
  assert.ok(!/(width|height|padding|font-size):/i.test(cards), 'no inline sizing on a locked card');
  assert.match(prop, /'--kpi-count': visibleKpis\.length/);
  assert.match(appCss, /\.dash-stats \{ grid-template-columns: repeat\(var\(--kpi-count, 5\)/);
});

test('an evaluation rate with no finished attempts reads as a dash, not 0%', () => {
  // Printing 0% would claim a failure record the trader does not have.
  assert.match(cards, /e\.rate == null \? '—'/);
});

test('the Prop Brief is two equal halves and carries no live clock', () => {
  assert.match(brief, /prop-brief-cols/);
  assert.match(brief, /<BriefColumn[\s\S]*?label="Needs your attention"/);
  assert.match(brief, /<BriefColumn[\s\S]*?label="Scheduled & idle"/);
  assert.match(appCss, /\.prop-brief-cols \{[\s\S]*?grid-template-columns: 1fr 1fr/);
  // Severity is a left rule plus the words, never colour alone.
  assert.match(appCss, /\.prop-brief-item \{[\s\S]*?border-left: 2px solid/);
  for (const sev of ['warn', 'crit', 'info']) {
    assert.match(appCss, new RegExp(`\\.prop-brief-item\\.${sev} \\{ border-left-color:`));
  }
  // Business state moves over days; a ticking clock would be motion that never
  // means anything (the Dashboard's banner ticks because its window ages out).
  assert.ok(!brief.includes('useMinuteClock'), 'no per-minute clock on a business brief');
  assert.ok(!brief.includes('setInterval'), 'no timer on a business brief');
  // It must never block on the economic feed.
  assert.match(brief, /\.catch\(\(\) => \{ if \(live\) setEvents\(\[\]\); \}\)/);
});

test('the brief narrows news to high-impact and today, keeping the user\'s markets', () => {
  assert.match(brief, /importance: 'high'/);
  assert.match(brief, /window: 'today'/);
  // Currency + timezone come from the user's own Today's Brief prefs.
  assert.match(brief, /\.\.\.\(prefs \|\| \{\}\)/);
});

test('the KPI filter is a checklist, and cannot empty the row', () => {
  assert.match(filter, /type="checkbox"/);
  // The last visible card is locked — an empty row collapses the section.
  assert.match(filter, /const locked = visible && shown\.length === 1;/);
  assert.match(filter, /disabled=\{locked\}/);
  // Closes on outside click and Escape, like the Brief popover it sits beside.
  assert.match(filter, /addEventListener\('mousedown', onDoc\)/);
  assert.match(filter, /e\.key === 'Escape'/);
  for (const ev of ['mousedown', 'keydown']) {
    assert.match(filter, new RegExp(`removeEventListener\\('${ev}'`), `${ev} listener leaks`);
  }
});

// ---- state plumbing --------------------------------------------------------

test('prop layout state is global and persisted, like the dashboard layout', () => {
  assert.match(app, /propLayout: fn\(sanitizePropLayout\(prev\.propLayout\)\)/);
  assert.match(app, /sanitizePropLayout\(viewConfigs\.propLayout\)/);
  // Not nested under an account scope — the Overview spans every account anyway.
  assert.doesNotMatch(app, /dashboard: \{ \.\.\.c\.dashboard, propLayout/);
  for (const prop2 of ['propLayout', 'setPropVisible', 'resetPropLayout']) {
    assert.ok(app.includes(prop2), `App.jsx must define ${prop2}`);
    assert.ok(layoutJsx.includes(prop2), `Layout.jsx must pass ${prop2}`);
  }
});
