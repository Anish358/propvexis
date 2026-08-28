import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRADE_COLUMNS, colVisible, visibleColumns, settingsColumns } from '../frontend/src/features/trades/tradeColumns.js';
import { fmtDayShort } from '../frontend/src/lib/constants.js';
import { exportValue, csvText, tradesToCsv } from '../frontend/src/features/trades/tradeExport.js';

import { appCss } from './helpers/app-css.js';
// The Trade Log's default view, table behaviour and headline KPI row. The column
// SPEC is plain data (tradeColumns.js) so it can be asserted directly; the cells
// are JSX and node can't import those, so their behaviour is read from source.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = appCss;
const table = read('../frontend/src/features/trades/TradesTable.jsx');
const spec = read('../frontend/src/features/trades/tradeColumns.js');
const log = read('../frontend/src/features/trades/TradeLog.jsx');
const cards = read('../frontend/src/features/dashboard/KpiCards.jsx');
const addTrade = read('../frontend/src/features/trades/AddTradeModal.jsx');
const bulk = read('../frontend/src/features/trades/BulkActions.jsx');
const dash = read('../frontend/src/features/dashboard/Dashboard.jsx');
const bar = read('../frontend/src/features/filters/FilterBar.jsx');

const cols = () => TRADE_COLUMNS;
const shown = (overrides = {}) => visibleColumns(overrides);
const labels = (list) => list.map((c) => c.label);

// ---- 1. default view --------------------------------------------------------

test('the default view is exactly the requested columns, in order', () => {
  assert.deepEqual(labels(shown()), [
    '',            // row selection — a checkbox, no heading text
    'Date & Time', 'Symbol', 'Type', 'Session', 'Entry', 'Exit', 'Volume',
    'Setup', 'Probability', 'Status', 'Net P&L', 'Notes',
  ]);
});

test('everything else is available but off by default', () => {
  const off = labels(cols().filter((c) => !colVisible({}, c)));
  assert.deepEqual(off, ['Duration', 'SL Size', 'MFE', 'Max R', 'Rules', 'Commission']);
  // Off by default, not absent: Trade Settings builds its list from this spec, so
  // each one is still a checkbox there.
  for (const l of off) assert.ok(labels(settingsColumns()).includes(l), `${l} missing from settings`);
});

test('the Rules column survived the refactor it landed across', () => {
  // dev added this column against the old inline registry while this branch was
  // replacing that registry with a spec + renderer map. It has to exist in BOTH
  // halves or it silently disappears in the merge.
  const col = TRADE_COLUMNS.find((c) => c.id === 'adherence');
  assert.ok(col, 'the adherence column is missing from the spec');
  assert.equal(col.defaultOn, false, 'only meaningful once a strategy defines rules');
  assert.ok(settingsColumns().some((c) => c.id === 'adherence'), 'must be a settings toggle');
  assert.match(table, /adherence: \(\) => \(t\) => \{/);
  // Renders the server's verdict rather than re-deciding it here.
  assert.match(table, /t\.adherence\?\.status/);
  assert.match(table, /RULE_LABEL\[r\] \|\| r/);
  assert.match(table, /from '[^']*constants\.js'/);
  // And it exports, like every other column that can be turned on.
  assert.equal(exportValue({ adherence: { status: 'followed' } }, 'adherence'), 'Followed');
  assert.equal(exportValue({ adherence: { status: 'broken' } }, 'adherence'), 'Broke rules');
  // Not a verdict, so not a value: "unassessed" beside Followed/Broke in a
  // spreadsheet column would read as a third outcome.
  assert.equal(exportValue({ adherence: { status: 'unassessed' } }, 'adherence'), '');
  assert.equal(exportValue({}, 'adherence'), '');
});

test('the chart-link and MTF columns are gone entirely', () => {
  // Removed from the table, not just hidden — they must not reappear as toggles.
  for (const id of ['m15', 'h1', 'h4', 'mtf']) {
    assert.ok(!TRADE_COLUMNS.some((c) => c.id === id), `${id} should be removed from the spec`);
    assert.ok(!settingsColumns().some((c) => c.id === id), `${id} should not be a settings toggle`);
  }
  // And their renderers went with them, along with the link component they used.
  assert.ok(!/\bm15:|\bh1:|\bh4:|\bmtf:/.test(table), 'dead renderers left behind');
  assert.ok(!table.includes('ChartLink'), 'ChartLink is unused now');
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
  assert.ok(all.indexOf('Commission') === all.indexOf('Net P&L') + 1, 'Commission follows the P&L it applies to');
  // Selection is always first — it's the row's handle, not a data column.
  assert.equal(TRADE_COLUMNS[0].id, 'select');
});

// ---- row selection ----------------------------------------------------------

test('selection is a fixed column: always on, never a settings toggle', () => {
  const sel = TRADE_COLUMNS.find((c) => c.id === 'select');
  assert.equal(sel.fixed, true);
  assert.equal(sel.narrow, true, 'it holds a checkbox, not a column of data');
  // An override can't hide it — it's structural, so colVisible ignores overrides.
  assert.ok(visibleColumns({ select: false }).some((c) => c.id === 'select'));
  assert.ok(!settingsColumns().some((c) => c.id === 'select'));
});

test('checkboxes appear on hover, and never open the row', () => {
  // A box on every row is noise; opacity (not display) so revealing one doesn't
  // shift the row. A TICKED box stays visible or the selection would be invisible.
  assert.match(css, /\.row-check \{[\s\S]*?opacity: 0;/);
  assert.match(css, /\.log-grid tbody tr:hover \.row-check, \.row-check\.is-on, \.row-check:focus-visible \{ opacity: 1; \}/);
  // The select-all in the header is the column's control, not a per-row hint.
  assert.match(css, /\.log-grid thead \.row-check \{ opacity: 1; \}/);
  // Clicking a box must not also open the preview panel behind it.
  assert.match(table, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(table, /onChange=\{\(e\) => \{ e\.stopPropagation\(\); onChange\(e\.target\.checked\); \}\}/);
  // Narrower than a data column — 44px for a 14px box.
  assert.match(css, /\.log-grid th\.col-select, \.log-grid td\.col-select \{ width: \d+px/);
});

test('the header box reflects, and acts on, the rows in view', () => {
  // After a filter narrows the table, "all" has to mean the visible rows — a header
  // box that counted every trade on the account would sit unchecked forever.
  assert.match(table, /allSelected: selectableCount > 0 && selectedHere === selectableCount/);
  assert.match(table, /someSelected: selectedHere > 0/);
  assert.match(table, /indeterminate=\{someSelected && !allSelected\}/);
  // indeterminate is a DOM property, so it needs setting imperatively.
  assert.match(table, /ref\.current\.indeterminate = indeterminate/);
  assert.match(log, /selectAll = \(on\) => setSelectedIds\(on \? new Set\(trades\.map\(\(t\) => t\.id\)\) : new Set\(\)\)/);
});

test('a selected id cannot outlive the row it belongs to', () => {
  // Filters change what's in view and trades get deleted; a stale id would keep
  // being counted for a row that is no longer on screen.
  assert.match(log, /const visible = new Set\(trades\.map\(\(t\) => t\.id\)\)/);
  assert.match(log, /\[\.\.\.selectedIds\]\.filter\(\(id\) => visible\.has\(id\)\)/);
  // Selecting shows something, or ticking a box looks inert.
  assert.match(log, /\{selected\.size\} selected/);
  assert.match(css, /\.log-selected \{/);
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
  // Scoped to the CELLS map — the HEADERS map below it keys off the same ids, so an
  // unscoped scan would double-count `select`.
  const cellsBlock = table.slice(table.indexOf('const CELLS = {'), table.indexOf('const HEADERS = {'));
  const rendered = [...cellsBlock.matchAll(/^ {2}([a-z0-9_]+): (\(|\{)/gm)].map((m) => m[1]);
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
  // Centering comes from .log-grid td now that every column is centered — the column
  // needs no rule of its own.
  assert.ok(!css.includes('.cell-notes {'), 'redundant .cell-notes rule');
});

// ---- 7. status --------------------------------------------------------------

test('Status is in the default view, and agrees with the P&L colour', () => {
  const col = cols().find((c) => c.id === 'status');
  assert.ok(col, 'no Status column');
  assert.equal(col.label, 'Status');
  assert.equal(col.defaultOn, true);
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
  // The row is <KpiRow> now, so there is no `.log-kpis` element left to pin — but the
  // rule above still scans for one, which is what keeps this honest if the class returns.
  assert.match(log, /<KpiRow>/);
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
  const th = css.slice(css.indexOf('.log-grid th {'), css.indexOf('}', css.indexOf('.log-grid th {')));
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
  assert.match(css, /\.log-grid \{[^}]*table-layout: fixed/);
  // Fixed layout truncates instead of widening, so cells must be able to ellipsis.
  assert.match(css, /\.log-grid td \{[\s\S]*?text-overflow: ellipsis/);
  const th = css.slice(css.indexOf('.log-grid th {'), css.indexOf('}', css.indexOf('.log-grid th {')));
  assert.match(th, /text-align: center/);
  // The width floor scales with the number of visible columns rather than being a
  // flat number that crushes a 21-column view.
  assert.match(css, /min-width: calc\(var\(--grid-cols, 11\) \* \d+px\)/);
  assert.match(table, /style=\{\{ '--grid-cols': cols\.length \}\}/);
});

test('every column is centered, header and body alike', () => {
  assert.match(css, /\.log-grid td \{[\s\S]*?text-align: center;/);
  // .num is shared with other tables, so its right alignment is overridden here
  // rather than removed — the tabular figures it brings are still wanted.
  assert.match(css, /\.num \{ text-align: right/);
  assert.match(css, /\.log-grid td\.num \{ text-align: center; \}/);
  // The old per-column centering hack is gone now that centering is the default.
  assert.ok(!css.includes('.log-grid td.cell-center'), 'cell-center is redundant');
  assert.ok(!table.includes('cell-center'), 'no cell should still ask to be centered');
});

test('the header is bigger, and taller than the rows', () => {
  const th = css.slice(css.indexOf('.log-grid th {'), css.indexOf('}', css.indexOf('.log-grid th {')));
  const size = Number(/font-size: (\d+)px/.exec(th)[1]);
  const pad = Number(/padding: (\d+)px/.exec(th)[1]);
  assert.ok(size >= 13, `header font should be at least 13px, got ${size}`);
  const tdPad = Number(/padding: (\d+)px/.exec(css.slice(css.indexOf('.log-grid td {'), css.indexOf('}', css.indexOf('.log-grid td {'))))[1]);
  assert.ok(pad > tdPad, `header padding (${pad}) should exceed the rows' (${tdPad})`);
});

test('the date reads "22 Jul 26" over the time', () => {
  // A month NAME scans faster down a column than 22/07/26, which is also ambiguous
  // to a US reader.
  assert.equal(fmtDayShort('2026-07-22T17:45:00'), '22 Jul 26');
  assert.equal(fmtDayShort(''), '');
  assert.equal(fmtDayShort('nonsense'), '');
  assert.match(table, /\{fmtDayShort\(t\.close_time\)\}/);
  // On two lines: the time is a block under the date, not trailing beside it.
  assert.match(css, /\.cell-time \{ display: block;/);
  // fmtDate is left alone — it feeds fmtDateTime, which the tag modal and preview
  // panel render inline and which this change doesn't cover.
  assert.match(read('../frontend/src/lib/constants.js'), /export function fmtDate\(/);
});

test('the Trade Settings button is icon-only', () => {
  assert.ok(!log.includes('⚙ Trade Settings'), 'the label should be gone');
  assert.match(log, /className="ts-open-btn ts-open-btn--icon"/);
  // An icon-only control still needs an accessible name.
  assert.match(log, /aria-label="Trade settings"/);
  assert.match(log, /title="Trade settings"/);
  assert.match(css, /\.ts-open-btn--icon \{/);
});

// ---- bulk actions -----------------------------------------------------------

const TRADE = {
  id: 1, symbol_base: 'EURUSD', direction: 'buy', session: 'LDN', setup: 'SMC', probability: 'HIGH',
  entry_price: 1.13939, exit_price: 1.14115, volume: 1.59, pnl_money: 271.89, fixed_r: 2, commission: -7.95,
  comments: 'SL sweep, then "clean" run', open_time: '2026-07-14T17:00:00Z', close_time: '2026-07-14T17:45:00Z',
};

test('bulk actions are inert until rows are selected', () => {
  assert.match(bulk, /const disabled = count === 0 \|\| busy;/);
  assert.match(bulk, /disabled=\{disabled\}/);
  assert.match(css, /\.bulk-btn:disabled \{/);
  // The count is in the label, so the button states what it will act on.
  assert.match(bulk, /Bulk actions\$\{count \? ` \(\$\{count\}\)` : ''\}/);
  // Losing the selection mid-menu (a filter change, a delete) must close it rather
  // than leave it pointing at an empty set.
  assert.match(bulk, /if \(disabled\) \{ setOpen\(false\); setSection\(null\); \}/);
  // Sits to the right of Trade Settings.
  assert.ok(log.indexOf('<BulkActions') > log.indexOf('ts-open-btn--icon'));
});

test('a partial failure is reported, not swallowed', () => {
  // allSettled, not all(): one rejection must not abandon the rest half-applied
  // and leave the user unable to tell which rows went through.
  assert.match(log, /Promise\.allSettled\(ids\.map\(\(id\) => fn\(id\)\)\)/);
  assert.match(log, /results\.filter\(\(r\) => r\.status === 'rejected'\)\.length/);
  assert.match(log, /\$\{failed\} of \$\{ids\.length\} failed/);
  // A failed delete keeps its row selected so it can be retried.
  assert.match(log, /if \(!failed\) setSelectedIds\(new Set\(\)\)/);
  assert.match(log, /className="log-bulk-error"/);
});

test('bulk delete confirms first', () => {
  assert.match(log, /if \(!confirm\(`Delete \$\{ids\.length\} trade/);
  assert.match(log, /cannot be undone/);
});

test('setting a field patches only that field', () => {
  // The API updates only the keys it's given, so setting a strategy across a
  // selection can't blank those trades' notes or probability.
  assert.match(log, /saveTrade\(id, \{ \[field\]: value \}\)/);
  assert.match(bulk, /onSetField\('setup', name\)/);
  assert.match(bulk, /onSetField\('probability', p\)/);
});

test('export writes the visible columns, as raw values', () => {
  const cols = visibleColumns({}).filter((c) => !c.fixed);
  const out = tradesToCsv([TRADE], cols, 'USD', false).split('\r\n');
  // Header is the on-screen columns in their on-screen order.
  assert.equal(out[0], 'Date & Time,Symbol,Type,Session,Entry,Exit,Volume,Setup,Probability,Status,Net P&L,Notes');
  // Raw numbers, not formatted cells — a spreadsheet wants 271.89, not "+$271.89".
  assert.ok(out[1].includes(',271.89,'), `expected a bare number: ${out[1]}`);
  assert.ok(!out[1].includes('$'), 'no currency symbols in the data');
  // The selection column is a control, not data.
  assert.ok(!out[0].includes('☐'));
  assert.match(log, /visibleColumns\(columnOverrides\)\.filter\(\(c\) => !c\.fixed\)/);
});

test('export values follow the display unit and mirror the cells', () => {
  assert.equal(exportValue(TRADE, 'result', 'USD'), 271.89);
  assert.equal(exportValue(TRADE, 'result', 'R'), 2);
  assert.equal(exportValue(TRADE, 'status', 'USD'), 'Win');
  assert.equal(exportValue(TRADE, 'pair'), 'EURUSD');
  assert.equal(exportValue(TRADE, 'datetime').startsWith('14 Jul 26'), true);
  // An unknown id yields an empty cell rather than throwing mid-export.
  assert.equal(exportValue(TRADE, 'nope'), '');
  assert.equal(exportValue(null, 'pair'), '');
  // Every visible column must produce something rather than undefined.
  for (const c of visibleColumns({}).filter((x) => !x.fixed)) {
    assert.notEqual(exportValue(TRADE, c.id, 'USD'), undefined, `${c.id} has no export value`);
  }
});

test('csv quoting survives a free-text note', () => {
  // Notes are free text; without quoting, one comma shifts every later column.
  assert.equal(csvText([['a,b', 'say "hi"']]), '"a,b","say ""hi"""');
  assert.equal(csvText([['line\nbreak']]), '"line\nbreak"');
  assert.equal(csvText([['plain', 42, null]]), 'plain,42,');
  assert.match(tradesToCsv([TRADE], [{ id: 'comments', label: 'Notes' }]), /"SL sweep, then ""clean"" run"/);
});

// ---- 3. KPI cards -----------------------------------------------------------

test('the trade log shows the four requested KPI cards', () => {
  assert.match(log, /<NetPnlCard m=\{m\} unit=\{unit\} \/>/);
  assert.match(log, /<ProfitFactorCard m=\{m\} \/>/);
  assert.match(log, /<TradeWinCard m=\{m\} \/>/);
  assert.match(log, /<AvgWinLossCard m=\{m\} \/>/);
  // Four cards in the shared KpiRow, which splits itself — the `--kpi-count: 4` this
  // used to pass is retired along with the CSS grid that read it (2026-08-28).
  assert.match(log, /<KpiRow>/);
  assert.doesNotMatch(log, /--kpi-count/);
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
  assert.match(dash, /from '[^']*KpiCards\.jsx'/);
  assert.match(log, /from '[^']*KpiCards\.jsx'/);
  // Dashboard keeps Day win %, which the trade log doesn't show.
  assert.match(cards, /export function DayWinCard/);
  assert.ok(!log.includes('DayWinCard'), 'the trade log shows four cards, not five');
});

// ---- the Add trade modal (owner pass 2026-08-27) ---------------------------

test('the modal and its button are called "Add trade", once', () => {
  // The name used to switch on whether a manual account was selected — "Add strategy
  // trade" when it was not, because an account-less trade lives only in the all-accounts
  // view. But the modal serves BOTH cases and its own Account field is what decides
  // which, so two names for one action (differing by a field the user has not reached
  // yet) read as two features.
  assert.equal(/Add strategy trade/.test(addTrade), false, 'the modal keeps one name');
  assert.equal(/Add strategy trade/.test(log), false, 'and so does the button that opens it');
  assert.match(addTrade, /<h3>Add trade<\/h3>/);
  assert.match(addTrade, /label="Add trade"/, 'the accessible name must match the visible one');
  assert.match(log, /onClick=\{\(\) => setAdding\(true\)\}>\+ Add trade<\/button>/);
});

test('the modal states no rule under its title', () => {
  // It restated the Account select in a sentence, immediately above the select itself.
  // Same reason the wizard's explanation text came out. The Explain beside the Trade
  // Log's button is where the manual-vs-account distinction is actually explained, and
  // that stays.
  assert.equal(/at-note/.test(addTrade), false);
  assert.match(log, /<Explain align="right">/, 'the explanation itself must not go with it');
});

test('a manual trade can carry its P&L, and blank means NULL not zero', () => {
  // The journal is R-based in the god view (`fixed_r`) and DOLLAR-based per account
  // (`pnl_money`), and the two are NOT derivable from each other — inferring one would
  // need a risk-per-trade figure this modal never asks for. Before this, a hand-entered
  // trade had no money figure at all and read as $0 on every single-account surface.
  assert.match(addTrade, /P&amp;L \(\$\)/);
  assert.match(addTrade, /pnl_money: f\.pnl_money === '' \? null : Number\(f\.pnl_money\)/,
    "blank must be null — Number('') is 0, which would file it as a breakeven");
  // R stays required: every R-based aggregate is computed from it, and the route refuses
  // a trade without one.
  assert.match(addTrade, /value=\{f\.fixed_r\} onChange=\{set\('fixed_r'\)\} required/);
  assert.equal(/value=\{f\.pnl_money\}[^/]*required/.test(addTrade), false, 'P&L is optional');
});
