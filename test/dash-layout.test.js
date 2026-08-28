import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appCss } from './helpers/app-css.js';
import { srcExists } from './helpers/src-files.js';
import {
  DASH_ZONES, DASH_SECTIONS, KPI_WIDGETS, MAIN_WIDGETS, DASH_LABEL,
  GRID_COLUMNS, WIDGET_SIZES, widgetSpan, widgetSizeName,
  defaultDashLayout, sanitizeDashLayout, isDefaultDashLayout,
  moveDashId, moveDashIdBefore,
  isDashVisible, visibleDashIds, visibleSections, sectionVisible, hiddenDashWidgets,
} from '../frontend/src/features/dashboard/dashLayout.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const dash = read('../frontend/src/features/dashboard/Dashboard.jsx');
const editor = read('../frontend/src/features/dashboard/DashLayoutEditor.jsx');
// Comments stripped. Use this for "the source must NOT contain X" checks — the
// editor's own comments legitimately name the approaches it rejects
// (elementFromPoint, HTML5 draggable), and matching prose gives a false positive.
const editorCode = editor.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
const app = read('../frontend/src/App.jsx');
const layoutJsx = read('../frontend/src/app/Layout.jsx');
const css = appCss;

// ---- model ------------------------------------------------------------------

test('default layout shows every section and widget in the shipped order', () => {
  const l = defaultDashLayout();
  assert.deepEqual(l.sections, ['brief', 'kpis', 'main']);
  assert.deepEqual(l.kpis, ['netPnl', 'tradeWin', 'profitFactor', 'dayWin', 'avgWinLoss']);
  assert.deepEqual(l.main, ['account', 'calendar', 'activity', 'cumulative']);
  assert.deepEqual(l.hidden, {});
  for (const id of Object.keys(DASH_LABEL)) assert.ok(isDashVisible(l, id), `${id} should start visible`);
});

test('zones are the three drag scopes and every entry has a label', () => {
  assert.deepEqual(DASH_ZONES, ['sections', 'kpis', 'main']);
  for (const w of [...DASH_SECTIONS, ...KPI_WIDGETS, ...MAIN_WIDGETS]) {
    assert.equal(DASH_LABEL[w.id], w.label, `${w.id} label mismatch`);
  }
});

test('the size vocabulary is closed and matches the grid width', () => {
  assert.equal(GRID_COLUMNS, 3);
  assert.deepEqual(Object.keys(WIDGET_SIZES).sort(), ['full', 'large', 'small', 'tall', 'wide']);
  assert.deepEqual(WIDGET_SIZES.small, { cols: 1, rows: 1 });
  assert.deepEqual(WIDGET_SIZES.wide, { cols: 2, rows: 1 });
  assert.deepEqual(WIDGET_SIZES.tall, { cols: 1, rows: 2 });
  assert.deepEqual(WIDGET_SIZES.large, { cols: 2, rows: 2 });
  assert.deepEqual(WIDGET_SIZES.full, { cols: GRID_COLUMNS, rows: 1 });
  // No widget may declare a footprint wider than the grid, or it can never place.
  for (const w of MAIN_WIDGETS) {
    assert.ok(WIDGET_SIZES[w.size], `${w.id} has unknown size ${w.size}`);
    assert.ok(widgetSpan(w.id).cols <= GRID_COLUMNS, `${w.id} is wider than the grid`);
  }
});

test('the default grid reproduces the previous hand-built layout', () => {
  // Account Health full-width across the top; Calendar 2 cols x 2 rows; the two
  // 1x1 widgets stacking in column 3 beside it.
  assert.deepEqual(widgetSpan('account'), { cols: 3, rows: 1 });
  assert.deepEqual(widgetSpan('calendar'), { cols: 2, rows: 2 });
  assert.deepEqual(widgetSpan('activity'), { cols: 1, rows: 1 });
  assert.deepEqual(widgetSpan('cumulative'), { cols: 1, rows: 1 });
  assert.equal(widgetSizeName('calendar'), 'large');
  // An unsized/unknown id falls back to 1x1 rather than throwing.
  assert.deepEqual(widgetSpan('nope'), { cols: 1, rows: 1 });
  assert.equal(widgetSizeName('nope'), 'small');
});

// ---- reordering -------------------------------------------------------------

test('moveDashId reorders, and no-ops on out-of-range or same-index moves', () => {
  const l = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveDashId(l, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveDashId(l, 3, 0), ['d', 'a', 'b', 'c']);
  // Identity-stable so React can bail out of a re-render.
  for (const [from, to] of [[1, 1], [-1, 2], [0, 9], [9, 0]]) {
    assert.equal(moveDashId(l, from, to), l, `move ${from}->${to} should return the same array`);
  }
  assert.deepEqual(l, ['a', 'b', 'c', 'd'], 'input must not be mutated');
});

test('moveDashIdBefore addresses widgets by id, not index', () => {
  // Index-based moves are unusable here: the editor reorders live during a drag,
  // so an index captured at drag start is stale by the next pointermove.
  const l = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveDashIdBefore(l, 'a', 'c'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveDashIdBefore(l, 'd', 'a'), ['d', 'a', 'b', 'c']);
  // Unknown ids and self-moves are no-ops, not crashes — a stray pointermove
  // over a stale target must not corrupt the layout.
  assert.equal(moveDashIdBefore(l, 'a', 'a'), l);
  assert.equal(moveDashIdBefore(l, 'zz', 'a'), l);
  assert.equal(moveDashIdBefore(l, 'a', 'zz'), l);
  assert.equal(moveDashIdBefore(null, 'a', 'b'), null);
  // Dragging across the whole list repeatedly converges rather than oscillating.
  let cur = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 5; i += 1) cur = moveDashIdBefore(cur, 'a', 'd');
  assert.deepEqual(cur, ['b', 'c', 'd', 'a']);
});

// ---- persistence ------------------------------------------------------------

test('sanitize honours a saved order and hidden set', () => {
  const l = sanitizeDashLayout({
    sections: ['main', 'brief', 'kpis'],
    kpis: ['dayWin', 'netPnl', 'tradeWin', 'profitFactor', 'avgWinLoss'],
    main: ['calendar', 'account', 'cumulative', 'activity'],
    hidden: { profitFactor: true, activity: true },
  });
  assert.deepEqual(l.sections, ['main', 'brief', 'kpis']);
  assert.deepEqual(l.main, ['calendar', 'account', 'cumulative', 'activity']);
  assert.equal(isDashVisible(l, 'profitFactor'), false);
  assert.equal(isDashVisible(l, 'activity'), false);
  assert.deepEqual(visibleDashIds(l, 'kpis'), ['dayWin', 'netPnl', 'tradeWin', 'avgWinLoss']);
  assert.deepEqual(visibleDashIds(l, 'main'), ['calendar', 'account', 'cumulative']);
});

test('sanitize drops unknown ids and appends widgets the save predates', () => {
  const l = sanitizeDashLayout({
    sections: ['kpis', 'ancientSection'],
    main: ['cumulative', 'ancientWidget'],
    kpis: ['dayWin'],
  });
  assert.ok(!l.sections.includes('ancientSection'));
  assert.ok(!l.main.includes('ancientWidget'));
  // Saved order first, then the ids it never knew about — visible, not hidden.
  assert.deepEqual(l.sections, ['kpis', 'brief', 'main']);
  assert.deepEqual(l.main, ['cumulative', 'account', 'calendar', 'activity']);
  assert.deepEqual(l.kpis, ['dayWin', 'netPnl', 'tradeWin', 'profitFactor', 'avgWinLoss']);
  assert.ok(isDashVisible(l, 'calendar'), 'a newly shipped widget must not arrive hidden');
});

test('a layout saved under the previous zone names degrades safely', () => {
  // The old model used `rows` (brief/kpis/account/main) and `side`
  // (activity/cumulative). Those keys no longer exist, so order falls back to
  // default — but the ids are unchanged, so the user's HIDDEN set still applies
  // and their KPI order (same key name) survives.
  const l = sanitizeDashLayout({
    rows: ['main', 'account', 'kpis', 'brief'],
    side: ['cumulative', 'activity'],
    kpis: ['avgWinLoss', 'netPnl', 'tradeWin', 'profitFactor', 'dayWin'],
    hidden: { cumulative: true, dayWin: true },
  });
  assert.deepEqual(l.sections, defaultDashLayout().sections);
  assert.deepEqual(l.main, defaultDashLayout().main);
  assert.deepEqual(l.kpis, ['avgWinLoss', 'netPnl', 'tradeWin', 'profitFactor', 'dayWin']);
  assert.equal(isDashVisible(l, 'cumulative'), false);
  assert.equal(isDashVisible(l, 'dayWin'), false);
});

test('sanitize is fail-safe on junk and ignores non-true hidden values', () => {
  for (const junk of [null, undefined, 'x', 42, [], true]) {
    assert.deepEqual(sanitizeDashLayout(junk), defaultDashLayout(), `${JSON.stringify(junk)} should fall back`);
  }
  const l = sanitizeDashLayout({ hidden: { netPnl: 'yes', dayWin: false, tradeWin: 0, brief: true } });
  assert.deepEqual(l.hidden, { brief: true });
  assert.deepEqual(sanitizeDashLayout({ hidden: { ancientWidget: true } }).hidden, {});
});

test('Reset Layout is offered only when the layout differs from the default', () => {
  assert.equal(isDefaultDashLayout(defaultDashLayout()), true);
  assert.equal(isDefaultDashLayout(undefined), true, 'an unsaved layout is the default');
  assert.equal(isDefaultDashLayout(sanitizeDashLayout({ hidden: { netPnl: true } })), false);
  assert.equal(isDefaultDashLayout(sanitizeDashLayout({ main: ['calendar', 'account', 'activity', 'cumulative'] })), false);
  assert.equal(isDefaultDashLayout(sanitizeDashLayout({ sections: ['kpis', 'brief', 'main'] })), false);
  // Key order must not decide this (a JSON.stringify compare would have).
  const d = defaultDashLayout();
  assert.equal(isDefaultDashLayout({ hidden: {}, main: d.main, kpis: d.kpis, sections: d.sections }), true);
  assert.match(editor, /disabled=\{isDefaultDashLayout\(layout\)\}/);
});

// ---- visibility -------------------------------------------------------------

test('sections disappear once everything inside them is off', () => {
  const allKpisOff = sanitizeDashLayout({
    hidden: { netPnl: true, tradeWin: true, profitFactor: true, dayWin: true, avgWinLoss: true },
  });
  assert.equal(sectionVisible(allKpisOff, 'kpis'), false, 'an empty KPI row would leave a bare gap');
  assert.deepEqual(visibleSections(allKpisOff), ['brief', 'main']);

  const allWidgetsOff = sanitizeDashLayout({
    hidden: { account: true, calendar: true, activity: true, cumulative: true },
  });
  assert.equal(sectionVisible(allWidgetsOff, 'main'), false);
  assert.deepEqual(visibleSections(allWidgetsOff), ['brief', 'kpis']);

  // Hiding the section itself wins over its children still being on.
  assert.equal(sectionVisible(sanitizeDashLayout({ hidden: { main: true } }), 'main'), false);
  // Brief has no children, so it only depends on its own toggle.
  assert.equal(sectionVisible(sanitizeDashLayout({ hidden: { brief: true } }), 'brief'), false);
  assert.equal(sectionVisible(defaultDashLayout(), 'brief'), true);
  // Section order is preserved through filtering.
  const reordered = sanitizeDashLayout({ sections: ['main', 'kpis', 'brief'], hidden: { kpis: true } });
  assert.deepEqual(visibleSections(reordered), ['main', 'brief']);
});

test('hidden widgets are enumerable, so the editor can offer them back', () => {
  // They vanish from the wireframe, so without a tray Reset Layout would be the
  // only way to restore one.
  assert.deepEqual(hiddenDashWidgets(defaultDashLayout()), []);
  const l = sanitizeDashLayout({ hidden: { calendar: true, dayWin: true, brief: true } });
  const tray = hiddenDashWidgets(l);
  assert.deepEqual(tray.map((w) => w.id).sort(), ['brief', 'calendar', 'dayWin']);
  assert.deepEqual(
    tray.map((w) => w.zone).sort(),
    ['kpis', 'main', 'sections'],
    'each entry must carry its zone and label',
  );
  for (const w of tray) assert.ok(w.label, `${w.id} needs a label for the chip`);
  assert.match(editor, /hiddenDashWidgets\(layout\)/);
  assert.match(editor, /className="dle-chip"/);
});

// ---- editor: it is an editor, not a settings panel --------------------------

test('the old settings-panel modal is gone', () => {
  // Checked by name across the whole tree, not at one path: a path-based check
  // would keep passing if the file came back in a feature folder.
  assert.ok(!srcExists('DashCustomizeModal.jsx'),
    'DashCustomizeModal.jsx should have been replaced by DashLayoutEditor.jsx');
  assert.ok(!dash.includes('DashCustomizeModal'));
  assert.match(dash, /<DashLayoutEditor\b[\s\S]*open=\{customizeOpen\}/);
  // No checkbox/radio/switch list: this surface is a wireframe, not a form.
  assert.ok(!/type="checkbox"/.test(editorCode), 'no checkbox lists in a layout editor');
  assert.ok(!/type="radio"/.test(editorCode));
  assert.ok(!/className="switch/.test(editorCode));
});

test('editor renders a titled panel with Reset Layout and Close', () => {
  assert.match(editor, /<h2>Customize Dashboard<\/h2>/);
  assert.match(editor, /Reset Layout/);
  assert.match(editor, /onClick=\{resetDashLayout\}/);
  assert.match(editor, /className="dle-x"[\s\S]*aria-label="Close"/);
  // Centered, and a LIGHT backdrop so the live dashboard stays visible behind it.
  assert.match(css, /\.dle-backdrop \{[\s\S]*align-items: center; justify-content: center/);
  // Scrim is a token now (--scrim-1) so it can lighten under a light theme.
  assert.match(css, /\.dle-backdrop \{[\s\S]*background: var\(--scrim-1\)/);
});

test('editor mirrors the real grid instead of describing it', () => {
  // Both the miniature and the page read widgetSpan()/GRID_COLUMNS from the model,
  // which is what stops the wireframe drifting out of sync with the dashboard.
  assert.match(editor, /widgetSpan\(id\)/);
  assert.match(dash, /widgetSpan\(id\)/);
  assert.match(editor, /'--dle-cols': GRID_COLUMNS/);
  assert.match(dash, /'--dash-grid-cols': GRID_COLUMNS/);
  for (const src of [editor, dash]) {
    assert.match(src, /gridColumn: `span \$\{cols\}`/);
    assert.match(src, /gridRow: `span \$\{rows\}`/);
  }
  // Dense auto-flow in both, so ordinal position + size is a complete placement.
  assert.match(css, /\.dash-grid \{[\s\S]*grid-auto-flow: row dense/);
  assert.match(css, /\.dle-grid \{[\s\S]*grid-auto-flow: row dense/);
});

test('widgets are wireframes: names only, no content', () => {
  assert.match(editor, /<span className="dle-tile-name">\{DASH_LABEL\[id\]\}<\/span>/);
  // The editor must not import or render any real dashboard widget.
  for (const f of ['MonthCalendar', 'recharts', 'AccountCard', 'ActivityCard', 'NetPnlCard']) {
    assert.ok(!editorCode.includes(f), `the wireframe must not render ${f}`);
  }
});

test('every catalogue widget has a renderer on the real dashboard', () => {
  // A widget in the model with no renderer would drag around the editor fine and
  // render as an invisible hole on the page.
  for (const id of MAIN_WIDGETS.map((w) => w.id)) {
    assert.match(dash, new RegExp(`\\b${id}: \\(\\) =>`), `gridWidget is missing ${id}`);
  }
  for (const id of KPI_WIDGETS.map((w) => w.id)) {
    assert.match(dash, new RegExp(`\\b${id}: \\(\\) =>`), `kpiCard is missing ${id}`);
  }
  for (const id of DASH_SECTIONS.map((s) => s.id)) {
    assert.match(dash, new RegExp(`\\b${id}: \\(\\) =>`), `sectionNode is missing ${id}`);
  }
});

test('the dashboard renders from the layout, not a hardcoded order', () => {
  assert.match(dash, /visibleSections\(layout\)/);
  assert.match(dash, /sections\.map/);
  assert.match(dash, /visibleKpis\.map/);
  assert.match(dash, /visibleWidgets\.map/);
  // The old two-column structure is gone.
  assert.ok(!dash.includes('dash-col-left'), 'the fixed left/right columns should be replaced by the grid');
  assert.ok(!dash.includes('mainRowLanes'));
});

// ---- editor: drag mechanics -------------------------------------------------

test('drag uses pointer events, not HTML5 drag-and-drop', () => {
  // The list reorders live, which moves the dragged node mid-gesture — HTML5 DnD
  // aborts when that happens, and is mouse-only besides.
  assert.match(editor, /onPointerDown=/);
  assert.match(editor, /addEventListener\('pointermove'/);
  assert.match(editor, /addEventListener\('pointerup'/);
  assert.match(editor, /addEventListener\('pointercancel'/);
  // Comments stripped first — the prose legitimately says "draggable tile".
  const code = editor.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  assert.ok(!/\bdraggable\b/.test(code), 'no HTML5 draggable attribute');
  assert.ok(!/onDragStart|onDragOver|onDrop|dataTransfer/.test(code), 'no HTML5 DnD handlers');
  // Listeners are torn down.
  for (const ev of ['pointermove', 'pointerup', 'pointercancel']) {
    assert.match(editor, new RegExp(`removeEventListener\\('${ev}'`), `${ev} listener leaks`);
  }
});

test('a drag never leaves its zone', () => {
  // Candidate tiles are filtered to the zone captured at drag start, so a KPI card
  // can't land in the grid and a grid widget can't become a section. Zone also
  // disambiguates nesting: a point inside a KPI card is inside its section's rect
  // too, and the zone filter — not depth — decides which one wins.
  assert.match(editor, /if \(zone !== drag\.zone\) continue;/);
  assert.match(editor, /'data-zone': zone/);
  // A pointerdown on a widget must not also start its section dragging.
  assert.match(editor, /e\.stopPropagation\(\)/);
});

test('hit-testing uses settled geometry, never elementFromPoint', () => {
  // elementFromPoint respects CSS transforms, and FLIP animates with transforms —
  // so mid-animation a tile sweeps across the cursor, gets reported as the drop
  // target, and triggers another reorder. That feedback loop is what made the
  // tiles shake. Testing against the rects FLIP measured at rest breaks it.
  assert.ok(!editorCode.includes('elementFromPoint'), 'elementFromPoint reintroduces the shake loop');
  assert.match(editor, /const hitTest = \(x, y\) =>/);
  assert.match(editor, /rects\.current/);
  // Transforms are cleared BEFORE measuring, or a tile caught mid-animation would
  // be recorded as being at rest there and the deltas would compound.
  assert.match(editor, /tile\.style\.transform = '';[\s\S]*?getBoundingClientRect/);

  // Belt and braces: a reorder also requires the pointer to have travelled, so a
  // STATIONARY pointer can never reorder twice however the grid repacks.
  assert.match(editor, /const MIN_TRAVEL = \d+;/);
  assert.match(editor, /tx \* tx \+ ty \* ty < MIN_TRAVEL \* MIN_TRAVEL/);
  assert.match(editor, /committedAt = \{ x, y \};/);

  // One hit-test per frame: pointermove outpaces paint, and reordering twice
  // between frames is work the user can never see.
  assert.match(editor, /requestAnimationFrame\(apply\)/);
  assert.match(editor, /cancelAnimationFrame\(frame\)/);
});

test('the dragged tile becomes the drop placeholder', () => {
  // It stays in the list as a dashed ghost, so the hole is exactly where it lands.
  assert.match(editor, /is-ghost/);
  assert.match(css, /\.dle-tile\.is-ghost[\s\S]*?border-style: dashed/);
  // pointer-events:none is what lets the hit-test see the tile beneath the cursor.
  assert.match(css, /\.dle-tile\.is-ghost[\s\S]*?pointer-events: none/);
});

test('other tiles FLIP-animate out of the way', () => {
  // Grid placement can't be transitioned, so movement is faked: measure before,
  // then animate each tile from where it was to where it is.
  assert.match(editor, /function useFlip/);
  assert.match(editor, /getBoundingClientRect/);
  assert.match(editor, /useLayoutEffect/);
  assert.match(editor, /transform = `translate\(\$\{dx\}px, \$\{dy\}px\)`/);
  assert.match(editor, /requestAnimationFrame/);
  // The ghost must not slide — it IS the target indicator.
  assert.match(editor, /dataset\.dragging === 'true'\) continue/);
  // Re-measured on every layout change, i.e. every live reorder.
  assert.match(editor, /useFlip\(\[layout\]\)/);
});

test('the editor is keyboard-operable, not pointer-exclusive', () => {
  // It's the only way to arrange the workspace, so it can't require a mouse.
  assert.match(editor, /altKey/);
  assert.match(editor, /ArrowUp/);
  assert.match(editor, /ArrowLeft/);
  assert.match(editor, /tabIndex=\{0\}/);
  // Escape used to be a hand-rolled `document` keydown listener here. Phase 4b moved
  // it — and the focus trap, focus return, aria-modal and scroll lock it never had —
  // onto the shared Modal shell. The REQUIREMENT is unchanged and still pinned; only
  // its source moved, so this asserts the editor is on the shell rather than
  // re-asserting a listener it is now correct for it not to have.
  assert.match(editor, /<Modal\b/, 'the editor must be on the shared Modal shell');
  assert.doesNotMatch(
    editor,
    /addEventListener\('keydown'/,
    'Escape is the shell\'s job now — a second listener would fight it',
  );
});

test('row components stay at module scope so drags survive re-render', () => {
  // Defined inside the component they would get a new identity every render, and
  // a live reorder re-renders constantly — React would remount the tile in hand.
  assert.match(editor, /^function VisibilityToggle\(/m);
  assert.match(editor, /^function useFlip\(/m);
  assert.match(editor, /^function useDragReorder\(/m);
});

// ---- state plumbing --------------------------------------------------------

test('layout state is global and persisted, not per account scope', () => {
  assert.match(app, /dashLayout: fn\(sanitizeDashLayout\(prev\.dashLayout\)\)/);
  assert.match(app, /sanitizeDashLayout\(viewConfigs\.dashLayout\)/);
  assert.doesNotMatch(app, /dashboard: \{ \.\.\.c\.dashboard, dashLayout/);
  // Moves are id-based all the way through — see moveDashIdBefore above.
  assert.match(app, /moveDashWidget = \(zone, id, targetId\)/);
  assert.match(app, /moveDashIdBefore\(l\[zone\], id, targetId\)/);
  for (const prop of ['dashLayout', 'setDashVisible', 'moveDashWidget', 'resetDashLayout']) {
    assert.ok(layoutJsx.includes(prop), `Layout.jsx must pass ${prop}`);
    assert.ok(app.includes(prop), `App.jsx must define ${prop}`);
  }
});

test('the KPI row re-splits itself, and grid rows size to content', () => {
  /* `--kpi-count` IS GONE (2026-08-28). The row was a CSS grid told how many columns to
   * draw, so hiding a card meant passing a new number or leaving a hole. KpiRow is flex:
   * the cards share the space, and the hero keeps the frame's 392:231 proportion by
   * ratio rather than by track. Same guarantee — hide a card and the rest widen — with
   * nothing to keep in sync. Asserted at the primitive, since the legacy `.dash-stats`
   * rule no longer applies to anything. */
  const kpi = readSrc('components/primitives/kpi.jsx');
  assert.match(kpi, /\[&>\*\]:min-w-\[10rem\] \[&>\*\]:flex-1/);
  /* FIVE EQUAL CARDS SINCE 2026-08-28 (owner call). The frame draws the hero at 1.7x a
   * default card (392 : 231) and it was built that way; in the real row the extra width
   * bought nothing — Net P&L's figure is no longer than "58.33%" — while making the row
   * visibly lopsided. The hero keeps what actually marks it out, the signed wash of its
   * own outcome colour, and gives up the width.
   *
   * Asserted as ABSENT because the ratio is the tempting thing to re-add from the frame
   * without noticing it was tried. */
  assert.doesNotMatch(kpi, /flex-\[1\.7\]/, 'the hero is the same size as every other card');
  assert.match(kpi, /data-kpi=\{hero \? 'hero' : undefined\}/, 'the hero is still marked, just not wider');
  assert.match(dash, /<KpiRow>/);
  // stripComments, because the note above KpiRow in Dashboard.jsx explains what
  // `--kpi-count` was — a rule that forbids a name cannot be explained using it.
  assert.doesNotMatch(stripComments(dash), /--kpi-count/, 'the column-count property is retired');
  // Rows must NOT be pinned to a fixed unit: that would stretch Account Health
  // (which has no height of its own) to a 355px row and change the page.
  assert.ok(!/\.dash-grid \{[^}]*grid-auto-rows/.test(css), 'grid rows should size to content');
  assert.match(css, /\.dash-grid \{[\s\S]*?align-items: start/);
  // Narrow screens collapse to one column.
  assert.match(css, /\.dash-grid > \.dash-grid-cell \{ grid-column: span 1 !important; grid-row: span 1 !important; \}/);
});

test('a widget with a fixed height still matches its declared row span', () => {
  /* THE CALENDAR LEFT THIS RULE ON 2026-08-28, and the rule is still right for the
   * widgets that remain under it.
   *
   * `--dash-card-h-lg` is (md * 2 + gap), so a `large` widget spanning two rows lines up
   * with two `small` card-md widgets stacked beside it — arithmetic that only matters
   * for a card whose height is DECLARED. The calendar's was, because its six week rows
   * divided the panel to fill it; the rebuilt cells carry their own height, so it sizes
   * to content now and a forced two-row height was just empty space under a five-week
   * month.
   *
   * Recent Activity and the chart keep theirs: one holds a scrolling list, the other a
   * ResponsiveContainer, and both need a definite box to flex into. */
  const dashSrc = readSrc('features/dashboard/Dashboard.jsx');
  assert.match(dashSrc, /<PanelCard className="dash-cal-panel">/, 'the calendar sizes to content');
  assert.ok(!/dash-cal-panel card-lg/.test(dashSrc), 'no fixed height on the calendar');
  /* NOTHING ON THIS PAGE DECLARES A HEIGHT ANY MORE (2026-08-28). The activity list is
   * capped at six rows by RecentTrades' own `limit`, and the chart declares its height
   * on the ResponsiveContainer — so both had a natural ceiling already and `card-md`
   * only added empty space beneath it. The classes still exist for Prop OS, which this
   * redesign has not reached. */
  assert.ok(!/className="card-(md|lg)"/.test(dashSrc), 'dashboard cards size to their content');
});
