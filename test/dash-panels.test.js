import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';

/* THE CONTENT PANELS — calendar, Recent Activity, cumulative P&L — on the 2026-08-28
 * Figma frame. */

const panel = readSrc('components/primitives/panel.jsx');
const cal = readSrc('components/primitives/calendar.jsx');
const calCode = stripComments(cal);
const month = readSrc('features/calendar/MonthCalendar.jsx');
const dash = readSrc('features/dashboard/Dashboard.jsx');
const recent = readSrc('features/trades/RecentTrades.jsx');
// Comment-free, because the note in RecentTrades explaining why it is NOT a table
// necessarily contains the word — the fourth scanner in this suite to learn it.
const recentCode = stripComments(recent);

test('the three cards are one shell, not three', () => {
  /* The frame draws the calendar, Recent Activity and the chart as the same box. They
   * are built as one — three hand-written shells is three places for the radius to
   * drift, which is exactly what happened to `.dash-cal-panel`, `.dash-activity` and
   * `.dash-equity` in the CSS this replaces. */
  // The padding moved onto a `flush` branch with Rhea (a table header band has to span
  // the card, so the panel that holds one cannot pad its children); the SHELL — one
  // radius, one border, one surface, declared once — is what this test is about.
  assert.match(panel, /rounded-\[14px\] border border-\[var\(--line\)\] bg-\[var\(--surface\)\]/);
  assert.match(panel, /flush \? 'overflow-hidden' : 'gap-\[18px\] px-6 pt-\[22px\] pb-6'/);
  const uses = (dash.match(/<PanelCard/g) || []).length;
  assert.ok(uses >= 3, `expected all three cards on PanelCard, found ${uses}`);
  // And none of them kept a bespoke box.
  for (const dead of ['dash-activity card-md', 'dash-equity card-md', 'panel dash-cal-panel']) {
    assert.ok(!dash.includes(dead), `${dead} is a second card shell`);
  }
});

test('the cell is one block and the result is in the text', () => {
  /* REVISED 2026-08-28 TO MATCH THE FRAME, on the owner's call. The first build washed
   * the whole tile in its outcome colour at 12% behind a 30% border; the frame draws
   * every day as the same recessed block, and it was visibly a different calendar from
   * the one designed.
   *
   * Beyond matching, what the block buys: forty-two tinted tiles is a lot of colour on a
   * page whose OTHER reds and ambers mean "this account is about to be closed". A quiet
   * grid leaves the account meters as the only alarming thing on screen, which is where
   * alarm belongs. The day is still legible — its P&L figure carries the outcome colour,
   * and that is the part you read.
   *
   * IDLE IS STILL NOT AN OUTCOME: same block at half strength, muted number. Present,
   * clearly part of the month, clearly empty. A month with holes in it reads as a
   * rendering fault. */
  assert.match(month, /const cellTone = \(data\) => \(data \? tone\(data\.pnl\) : 'idle'\)/);
  assert.match(month, /const tone = \(n\) => \(n > 0 \? 'win' : n < 0 \? 'loss' : 'flat'\)/);
  assert.doesNotMatch(calCode, /color-mix\(in srgb, \$\{hue\} 12%/, 'the cell no longer washes itself');
  assert.match(calCode, /background: idle \? 'color-mix\(in srgb, var\(--surface-2\) 20%, transparent\)' : 'var\(--brief-row-bg\)'/);
  // The figure keeps its outcome colour — that is where the result lives now.
  assert.match(calCode, /color: hue \|\| 'var\(--text\)'/);
});

test('only the P&L is coloured inside a cell', () => {
  // The trade count and win rate are context. Three coloured lines in a 100px tile make
  // the cell compete with its own neighbours, and the figure stops being the figure.
  const body = calCode.slice(calCode.indexOf('export function CalCellBody'));
  const block = body.slice(0, body.indexOf('export function CalWeek'));
  assert.match(block, /color: hue \|\| 'var\(--text\)'/);
  assert.match(block, /text-\[var\(--muted\)\]/, 'the sub-line stays muted');
  assert.equal((block.match(/color: hue/g) || []).length, 1, 'exactly one coloured element per cell');
});

test('the calendar owns the gap the old header used to supply', () => {
  /* `.cal-head` carried the spacing in its bottom padding, margin AND border, all three
   * of which went with the rebuilt header. The PanelCard's own gap cannot help, because
   * the whole calendar is ONE child of it — so without CalRoot the weekday row crowds
   * the subtitle. Caught in a headless render, not by reading the numbers. */
  assert.match(cal, /export function CalRoot/);
  assert.match(cal, /flex min-h-0 flex-1 flex-col gap-3/);
  assert.match(month, /<CalRoot>/);
  assert.ok(!month.includes('className="cal"'), 'the legacy .cal wrapper is gone');
});

test('a page never writes a column width or an alignment', () => {
  /* Utilities compile only under components/{ui,primitives}. RecentTrades needs three
   * column tracks and three alignments, and writing either there emits nothing at all —
   * silently, with the row collapsing to whatever the content measured. That is the one
   * failure mode in this repo with no error message.
   *
   * WIDENED TO ALIGNMENT (2026-08-29). The first draft of the Rhea table wrote
   * `className="text-right"` on the Net P&L header, which would have left it
   * left-aligned above a right-aligned column. Caught by this test, which is what it is
   * for; `align` and `head` are props on PanelTableCell now.
   *
   * The COLUMN TEMPLATE is a prop too, and declared ONCE for the header and the rows
   * together — a header that computes its tracks separately from its data is a header
   * that drifts a pixel off it the first time either is touched. */
  assert.match(panel, /export function PanelTableCell/);
  assert.match(recent, /const COLS = /, 'one template, shared by the head and the rows');
  assert.match(recent, /<PanelTableHead cols=\{COLS\}>/);
  assert.match(recent, /<PanelTableRow key=\{t\.id\} cols=\{COLS\}>/);
  // Comment-stripped: the note in RecentTrades explaining the trap necessarily quotes
  // the class it warns about. The seventh scanner in this repo to need this.
  assert.ok(!/className="[^"]*\b(w-\d|flex-1|min-w-0|shrink-0|tabular-nums|text-(left|right|center))/.test(stripComments(recent)),
    'RecentTrades writes layout utilities, which do not compile outside the library');
});

test('the list is a list, and its rows are divided between rather than under', () => {
  // `last:border-b-0` — a border under the final row reads as a list cut off mid-scroll
  // that continues below the card, which is the one thing a "recent" list must not imply.
  assert.match(panel, /py-2 text-\[13px\] leading-5 last:border-b-0/);
  assert.ok(!recentCode.includes('<table'), 'three single values a row is a list, not a table');
});

test('the panels stay presentation only', () => {
  for (const leak of ['useState', 'useEffect', 'fmtVal', 'metrics']) {
    assert.ok(!stripComments(panel).includes(leak), `panel.jsx must not know about ${leak}`);
    assert.ok(!calCode.includes(leak), `calendar.jsx must not know about ${leak}`);
  }
});
