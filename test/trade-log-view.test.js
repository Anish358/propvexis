import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRADE_COLUMNS, colVisible, visibleColumns } from '../frontend/src/tradeColumns.js';

// The Trade Log's default view, table behaviour and headline KPI row. The column
// SPEC is plain data (tradeColumns.js) so it can be asserted directly; the cells
// are JSX and node can't import those, so their behaviour is read from source.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = read('../frontend/src/styles.css');
const table = read('../frontend/src/TradesTable.jsx');
const spec = read('../frontend/src/tradeColumns.js');
const log = read('../frontend/src/TradeLog.jsx');
const cards = read('../frontend/src/KpiCards.jsx');
const dash = read('../frontend/src/Dashboard.jsx');
const bar = read('../frontend/src/FilterBar.jsx');

const cols = () => TRADE_COLUMNS;
const shown = (overrides = {}) => visibleColumns(overrides);
const labels = (list) => list.map((c) => c.label);

// ---- 1. default view --------------------------------------------------------

test('the default view is exactly the eleven requested columns, in order', () => {
  assert.deepEqual(labels(shown()), [
    'Date & Time', 'Type', 'Symbol', 'Entry', 'Exit', 'Volume',
    'Setup', 'Probability', 'Net P&L', 'Commission', 'Notes',
  ]);
});

test('everything else is available but off by default', () => {
  const off = labels(cols().filter((c) => !colVisible({}, c)));
  assert.deepEqual(off, ['Duration', 'Session', 'SL Size', 'MFE', 'Max R', 'MTF Phase', 'Status', 'M15', 'H1', 'H4']);
  // Off by default, not absent: Trade Settings builds its list from this registry,
  // so each one is still a checkbox there.
  assert.equal(cols().length, 21);
});

test('the default order holds however the registry grows', () => {
  // Registry order IS render order, so the optional columns have to be slotted
  // between the defaults without disturbing their sequence.
  const all = labels(cols());
  const defaults = labels(shown());
  const positions = defaults.map((l) => all.indexOf(l));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'defaults must stay in registry order');
  // And each optional column sits next to the data it belongs with.
  assert.ok(all.indexOf('Duration') === all.indexOf('Date & Time') + 1, 'Duration follows the timestamp');
  assert.ok(all.indexOf('Status') === all.indexOf('Net P&L') - 1, 'Status precedes the P&L it describes');
});

test('the P&L column label does not change with the display unit', () => {
  // It reads "Net P&L" in both units, matching the KPI card above it; only the
  // VALUE switches between real $ and Fixed R.
  assert.equal(cols().find((c) => c.id === 'result').label, 'Net P&L');
  assert.match(table, /const result = unit === 'USD' \? t\.pnl_money : t\.fixed_r;/);
});

test('every column in the spec has a renderer', () => {
  // A spec entry with no cell would show as a permanently empty column, so
  // buildColumns throws rather than rendering a silent hole. Verified from source
  // (node can't import the JSX) plus the id lists matching.
  assert.match(table, /has no cell renderer/);
  const rendered = [...table.matchAll(/^ {2}([a-z0-9_]+): \(/gm)].map((m) => m[1]);
  assert.deepEqual([...rendered].sort(), TRADE_COLUMNS.map((c) => c.id).sort());
});

// ---- 6. notes ---------------------------------------------------------------

test('Notes is an icon, not the prose', () => {
  const col = cols().find((c) => c.id === 'comments');
  assert.equal(col.label, 'Notes');
  // The id stays `comments` — it names the field the note is stored in, and
  // renaming it would silently discard saved show/hide choices.
  assert.equal(col.id, 'comments');
  assert.match(spec, /id: 'comments', label: 'Notes'/);
  assert.match(table, /function NoteMark/);
  assert.match(table, /<svg /);
  // Hovering reads the note; the row opens the full text.
  assert.match(table, /title=\{text\}/);
  // The old full-text cell (and its width cap) is gone.
  assert.ok(!table.includes('className="comments"'), 'the prose cell should be gone');
  assert.ok(!css.includes('.comments {'), 'dead .comments rule left behind');
  assert.match(css, /\.cell-notes \{ text-align: center; \}/);
});

// ---- 7. status --------------------------------------------------------------

test('Status is available, off by default, and agrees with the P&L colour', () => {
  const col = cols().find((c) => c.id === 'status');
  assert.ok(col, 'no Status column');
  assert.equal(col.label, 'Status');
  assert.equal(col.defaultOn, false);
  // Both the Status pill and the P&L cell's tone come from tradeOutcome, so they
  // can never disagree about whether a trade won.
  const statusCell = table.slice(table.indexOf('  status: ('), table.indexOf('  result: ('));
  assert.match(statusCell, /tradeOutcome\(t, unit, beRounding\)/);
  assert.match(table.slice(table.indexOf('  result: (')), /tradeOutcome\(t, unit, beRounding\)/);
  assert.match(table, /OUTCOME_LABEL = \{ win: 'Win', loss: 'Loss', be: 'BE' \}/);
});

// ---- 8. breakeven is blue ---------------------------------------------------

test('breakeven reads blue, and does so through the token layer', () => {
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  assert.match(root, /--be: var\(--blue-400\); --be-bg: var\(--accent-bg\);/);
  // Grey is gone from the breakeven cell specifically.
  const be = css.split('\n').find((l) => l.startsWith('.cell-be {'));
  assert.match(be, /color: var\(--be\)/);
  assert.ok(!be.includes('var(--muted)'), 'breakeven should no longer be grey');
  // Win/loss are untouched — the three outcomes stay distinguishable.
  const win = css.split('\n').find((l) => l.startsWith('.cell-win {'));
  const loss = css.split('\n').find((l) => l.startsWith('.cell-loss {'));
  assert.match(win, /var\(--profit\)/);
  assert.match(loss, /var\(--loss\)/);
  // The Status pill uses the same three tokens.
  assert.match(css, /\.pill\.out-be \{ background: var\(--be-bg\); color: var\(--be\); \}/);
});

// ---- 2. sticky header, one page scroll -------------------------------------

test('the column header sticks to the top bar, and the page is the only scroller', () => {
  // A sticky header sticks to its nearest scroll box, so there must not be one
  // between the header cells and the page — otherwise the table gets a second
  // scrollbar (or the header pins to a box that never moves and does nothing).
  assert.match(css, /\.log-panel \{ padding: 0; \}/);
  assert.match(css, /\.log-panel \.grid-wrap \{ overflow: visible; \}/);
  const panelRules = css.slice(css.indexOf('.log-panel {'), css.indexOf('.add-trade-group'));
  assert.ok(!/max-height/.test(panelRules), 'no height cap — the panel runs the full length of the log');
  assert.ok(!/overflow:\s*(auto|hidden|scroll)/.test(panelRules), 'no second scroll box');
  // Offset is the MEASURED bar height, not a hardcoded guess.
  assert.match(css, /position: sticky; top: var\(--topbar-h, \d+px\)/);
  assert.match(bar, /setProperty\('--topbar-h', `\$\{el\.offsetHeight\}px`\)/);
  assert.match(bar, /new ResizeObserver\(publish\)/);
  assert.match(bar, /ro\.disconnect\(\)/);
  assert.match(bar, /<div className="topbar" ref=\{barRef\}>/);
});

test('nothing but the top bar is pinned', () => {
  // The KPI row and the toolbar scroll away with the page — nothing else may be
  // pinned, or it would stack up under the bar and eat the viewport. Any rule that
  // mentions either class is checked, so a new one can't quietly pin them.
  const pinned = css.split('\n')
    .filter((l) => /\.log-kpis|\.log-toolbar/.test(l) && /position:\s*(sticky|fixed)/.test(l));
  assert.deepEqual(pinned, [], `nothing on the trade log may be pinned:\n${pinned.join('\n')}`);
  assert.match(log, /className="jo-kpis dash-stats log-kpis"/);
});

test('the KPI row is spaced by the standard gap, not a margin on top of it', () => {
  // .page-body is a flex column with gap:16px — the app-wide spacing between major
  // card sections. A margin on the KPI row ADDS to that gap rather than setting it,
  // which is what put 32px between the cards and the table.
  assert.match(css, /\.page-body \{[^}]*gap: 16px/);
  const own = css.split('\n').filter((l) => l.startsWith('.log-kpis'));
  assert.deepEqual(own.filter((l) => /margin/.test(l)), [], '.log-kpis must not add its own margin');
});

test('column headers read as titles, not eyebrow caps', () => {
  const th = css.slice(css.indexOf('.grid th {'), css.indexOf('}', css.indexOf('.grid th {')));
  // A declaration, not the word — the rule's comment explains its own absence.
  assert.ok(!/text-transform\s*:/.test(th), 'headers use the label as authored');
  // Wide tracking exists to open up all-caps; on mixed case it just reads loose.
  assert.match(th, /letter-spacing: 0/);
  // The labels are already title case. Short abbreviations (MFE, M15, H1, H4) are
  // legitimately uppercase — it's shouted WORDS that this guards against.
  for (const c of TRADE_COLUMNS.filter((x) => x.label.length > 4)) {
    assert.notEqual(c.label, c.label.toUpperCase(), `${c.id} label should not be all-caps`);
  }
});

// ---- 4 + 5. widths and alignment -------------------------------------------

test('columns are equal width with centered titles', () => {
  assert.match(css, /\.grid \{[^}]*table-layout: fixed/);
  // Fixed layout truncates instead of widening, so cells must be able to ellipsis.
  assert.match(css, /\.grid td \{[\s\S]*?text-overflow: ellipsis/);
  const th = css.slice(css.indexOf('.grid th {'), css.indexOf('}', css.indexOf('.grid th {')));
  assert.match(th, /text-align: center/);
  // The width floor scales with the number of visible columns rather than being a
  // flat number that crushes a 21-column view.
  assert.match(css, /min-width: calc\(var\(--grid-cols, 11\) \* \d+px\)/);
  assert.match(table, /style=\{\{ '--grid-cols': cols\.length \}\}/);
});

test('volume is centered, other numeric columns stay right-aligned', () => {
  assert.equal(cols().find((c) => c.id === 'volume').align, 'center');
  assert.match(table, /volume: \(\) => \(t\) => <td className="num cell-center">/);
  assert.match(css, /\.grid td\.cell-center \{ text-align: center; \}/);
  // Prices and money keep the right edge, where a decimal column belongs.
  const lines = table.split('\n');
  for (const id of ['entry_price', 'exit_price', 'result', 'commission']) {
    assert.equal(cols().find((c) => c.id === id).align, undefined, `${id} should stay right-aligned`);
    // Only that renderer's own lines — a wider window runs into the next entry,
    // and `volume` sits right after the price columns.
    const start = lines.findIndex((l) => l.startsWith(`  ${id}: (`));
    const rest = lines.slice(start + 1).findIndex((l) => /^ {2}[a-z0-9_]+: \(/.test(l));
    const own = lines.slice(start, rest < 0 ? undefined : start + 1 + rest).join('\n');
    assert.ok(!own.includes('cell-center'), `${id} cell should not be centered`);
  }
  assert.match(css, /\.num \{ text-align: right/);
});

// ---- 3. KPI cards -----------------------------------------------------------

test('the trade log shows the four requested KPI cards', () => {
  assert.match(log, /<NetPnlCard m=\{m\} unit=\{unit\} \/>/);
  assert.match(log, /<ProfitFactorCard m=\{m\} \/>/);
  assert.match(log, /<TradeWinCard m=\{m\} \/>/);
  assert.match(log, /<AvgWinLossCard m=\{m\} \/>/);
  // Four columns, so the row splits evenly instead of leaving a fifth gap.
  assert.match(log, /style=\{\{ '--kpi-count': 4 \}\}/);
  assert.match(css, /\.dash-stats \{ grid-template-columns: repeat\(var\(--kpi-count, 5\)/);
});

test('the cards describe the filtered rows underneath them', () => {
  // computeMetrics over the same `trades` the table renders — which is already the
  // globally-filtered set — so narrowing a filter re-states the headline numbers.
  assert.match(log, /computeMetrics\(trades, unit, !!tradeSettings\.beRounding\)/);
  assert.match(log, /\[trades, unit, tradeSettings\.beRounding\]/);
});

test('both pages render the SAME card components', () => {
  // Net P&L is the locked master card and the others match its geometry; a second
  // copy would drift the first time either page was tuned.
  for (const c of ['NetPnlCard', 'TradeWinCard', 'ProfitFactorCard', 'AvgWinLossCard']) {
    assert.match(cards, new RegExp(`export function ${c}\\b`), `KpiCards must export ${c}`);
    assert.ok(!new RegExp(`function ${c}\\b`).test(dash), `Dashboard must not redefine ${c}`);
  }
  assert.match(dash, /from '\.\/KpiCards\.jsx'/);
  assert.match(log, /from '\.\/KpiCards\.jsx'/);
  // Dashboard keeps Day win %, which the trade log doesn't show.
  assert.match(cards, /export function DayWinCard/);
  assert.ok(!log.includes('DayWinCard'), 'the trade log shows four cards, not five');
});
