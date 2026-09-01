import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appCss } from './helpers/app-css.js';
import { readSrc, allSrcFiles } from './helpers/src-files.js';

/* THE THREE PANEL HEIGHTS, AND THE SUM THAT MAKES THEM LINE UP.
 *
 * The dashboard draws a tall calendar beside a stacked pair, and the design's whole
 * proportion is that the pair plus the gap between them equals the calendar exactly:
 *
 *     374 (Recent trades) + 16 (gap) + 390 (Cumulative P&L) = 780 (Calendar)
 *
 * This was unreachable for as long as the page was customizable. Every card took its
 * height from its GRID SPAN — one unit `md`, with `lg = md * 2 + gap` — because a
 * rearrangeable grid can only offer EQUAL cards, and a trader who moved the chart would
 * otherwise take its height with it. The design does not use equal cards: 374 != 390.
 * So the editor's flexibility and the design's proportions were mutually exclusive, and
 * the editor won by default, shipping a 726px column where 780 was drawn.
 *
 * The calendar is DERIVED from the other two rather than declared, so the identity above
 * cannot rot: change either card and the calendar follows. This test pins the numbers,
 * the derivation, and the fact that nothing reintroduces a stored layout.
 */

const tokens = readSrc('styles/tokens.css');
const dashboard = readSrc('features/dashboard/Dashboard.jsx');

const tokenValue = (name) => {
  const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(tokens);
  assert.ok(m, `--${name} is not declared`);
  return m[1].trim();
};

test('the two right-hand cards carry the design\'s own heights', () => {
  assert.equal(tokenValue('dash-trades-h'), '374px');
  assert.equal(tokenValue('dash-chart-h'), '390px');
  assert.equal(tokenValue('dash-card-gap'), '16px');
});

test('the calendar is DERIVED from them, so the columns cannot drift apart', () => {
  // Written as a number, the 780 would survive a change to either card above and the
  // two columns would quietly stop ending on the same line.
  const cal = tokenValue('dash-cal-h');
  assert.match(cal, /^calc\(/, 'the calendar height must be derived, not declared');
  for (const part of ['--dash-trades-h', '--dash-chart-h', '--dash-card-gap']) {
    assert.ok(cal.includes(part), `the calendar height must be built from ${part}`);
  }
  // And the arithmetic it encodes is the design's.
  assert.equal(374 + 390 + 16, 780);
});

test('each cell wears its height, and its card fills the cell', () => {
  // Heights on the CELLS keeps the cards unaware of where they were placed — the same
  // ActivityCard is used elsewhere and must not carry a dashboard number.
  assert.match(appCss, /\.dash-cal-cell\s*\{[^}]*height:\s*var\(--dash-cal-h\)/);
  assert.match(appCss, /\.dash-trades-cell\s*\{[^}]*height:\s*var\(--dash-trades-h\)/);
  assert.match(appCss, /\.dash-chart-cell\s*\{[^}]*height:\s*var\(--dash-chart-h\)/);
  assert.match(appCss, /\.dash-cal-cell > \*, \.dash-trades-cell > \*, \.dash-chart-cell > \*/);
});

test('the content grid is the design\'s two columns, not three with a span', () => {
  // The prototype writes `minmax(0,67fr) minmax(0,33fr)`. Three equal columns with the
  // calendar spanning two reaches the same ratio the long way round — an artifact of
  // needing arbitrary widget footprints, which nothing needs any more.
  assert.match(appCss, /\.dash-main-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*67fr\)\s+minmax\(0,\s*33fr\)/);
  // Account Health spans both and keeps sizing to its content — pinning it to a card
  // height leaves dead surface under its footer.
  assert.match(appCss, /\.dash-account-cell\s*\{[^}]*grid-column:\s*1 \/ -1/);
  assert.ok(!/\.dash-account-cell\s*\{[^}]*height:/.test(appCss),
    'Account Health must not be given a fixed height');
});

test('the generic .dash-grid survives for the pages still using it', () => {
  // Prop OS and AccountWorkspace set --dash-grid-cols and span cells by hand. The
  // dashboard took its own class rather than redefining theirs underneath them.
  assert.match(appCss, /\.dash-grid\s*\{[^}]*repeat\(var\(--dash-grid-cols, 3\)/);
  for (const f of ['features/prop/PropOS.jsx', 'features/prop/AccountWorkspace.jsx']) {
    assert.match(readSrc(f), /className="dash-grid"/, `${f} still needs the generic grid`);
  }
});

test('nothing stores or restores a dashboard layout any more', () => {
  for (const gone of ['dashLayout.js', 'DashLayoutEditor.jsx']) {
    assert.ok(!allSrcFiles().some((f) => f.endsWith(gone)), `${gone} is back`);
  }
  assert.ok(!/dashLayout|visibleDashIds|widgetSpan/.test(dashboard),
    'the Dashboard reads a layout again — its arrangement is meant to be its JSX');
  // The page order is markup order now, so the grid is written once, in one place.
  assert.equal((dashboard.match(/className="dash-main-grid"/g) ?? []).length, 2,
    'the real page and its skeleton each render the grid exactly once');
});

test('the skeleton reserves the same boxes as the page', () => {
  // §15: a skeleton that reserves a different shape from its content is the layout jump
  // it exists to prevent — and with fixed heights there is no excuse for disagreeing.
  const skeleton = dashboard.slice(dashboard.indexOf('function DashSkeleton'));
  for (const cell of ['dash-cal-cell', 'dash-trades-cell', 'dash-chart-cell', 'dash-side']) {
    assert.ok(skeleton.includes(cell), `the skeleton is missing ${cell}`);
  }
});

/* THE CASCADE TRAP THAT MADE EVERY RESPONSIVE SIZE DEAD (found 2026-08-30).
 *
 * legacy/app.css is `layer(legacy)`; tokens.css is UNLAYERED. An unlayered declaration
 * beats a layered one at any specificity, inside a media query or not — so every
 * `:root { --token: … }` written in app.css lost to the base declaration in tokens.css
 * and did nothing at all.
 *
 * It had been that way since the cascade was inverted on 2026-08-28: `--cal-cell-h`
 * never narrowed from 82px and `--dash-card-h-md` never narrowed from 355px, at any
 * viewport. Nothing failed loudly. The page was simply always drawn at its widest
 * sizes, which is exactly the class of defect §22 asks to be caught by rendering at
 * both ends of the range.
 *
 * So: a token is re-declared where the token lives, and this fails if one drifts back.
 */
test('no stylesheet re-declares a token where it cannot win', () => {
  const legacy = readSrc('styles/legacy/app.css');
  // Strip comments first — this file DISCUSSES the trap at length, and a rule that
  // cannot tell prose from code punishes the file for explaining itself.
  const code = legacy.replace(/\/\*[\s\S]*?\*\//g, '');
  const rootBlocks = [...code.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
  for (const block of rootBlocks) {
    const custom = [...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    assert.deepEqual(
      custom, [],
      `legacy/app.css re-declares ${custom.join(', ')} in a :root block — it is layered, ` +
      'so this is silently ignored. Move it to tokens.css, beside the base declaration.',
    );
  }
});

test('the narrow step keeps the two columns equal', () => {
  // The whole reason the calendar is derived: at 1400 the two cards shrink, and the
  // calendar has to shrink by exactly their sum or the columns stop ending together.
  const tokensSrc = readSrc('styles/tokens.css');
  const media = /@media \(max-width: 1400px\)\s*\{[\s\S]*?\n\}/.exec(tokensSrc);
  assert.ok(media, 'the 1400px step is gone');
  const num = (name) => {
    const m = new RegExp(`--${name}\\s*:\\s*(\\d+)px`).exec(media[0]);
    assert.ok(m, `--${name} is not re-declared at the 1400px step`);
    return Number(m[1]);
  };
  // 340 + 16 + 352 = 708, and --dash-cal-h computes it rather than restating it.
  assert.equal(num('dash-trades-h') + 16 + num('dash-chart-h'), 708);
});

test('the equity curve takes a crosshair pointer', () => {
  /* A cumulative curve is read by tracking one point along it — "where was I on the
   * 14th" — and an arrow gives no purchase on that. `crosshair` is the browser's own
   * plus-shaped pointer and the convention every charting tool a trader already uses
   * sets, so it costs nothing to learn. On the FILL rather than the card, so the
   * heading and its chip keep the normal pointer. */
  assert.match(appCss, /\.dash-equity-fill \{[^}]*cursor: crosshair/);
});
