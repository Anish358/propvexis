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
  assert.match(panel, /rounded-\[20px\] border border-\[var\(--line\)\] bg-\[var\(--surface\)\] p-5/);
  const uses = (dash.match(/<PanelCard/g) || []).length;
  assert.ok(uses >= 3, `expected all three cards on PanelCard, found ${uses}`);
  // And none of them kept a bespoke box.
  for (const dead of ['dash-activity card-md', 'dash-equity card-md', 'panel dash-cal-panel']) {
    assert.ok(!dash.includes(dead), `${dead} is a second card shell`);
  }
});

test('a day is coloured by its result, and idle is not an outcome', () => {
  /* THE POINT OF THE GRID. Twelve green cells and four red ones is a month read in half
   * a second, before any figure. The distinction that matters is the third one: a day
   * with NO trades gets no wash and no border, while a day that was traded and closed
   * at zero keeps its border. Collapsing them would make a quiet week look like sixteen
   * breakeven sessions — a different and much worse story. */
  assert.match(month, /const cellTone = \(data\) => \(data \? tone\(data\.pnl\) : 'idle'\)/);
  assert.match(month, /const tone = \(n\) => \(n > 0 \? 'win' : n < 0 \? 'loss' : 'flat'\)/);
  assert.match(calCode, /idle \? 'transparent'/);
  // The wash is weaker than the brief's alert rows on purpose: these are 42 tiles on
  // one card, and at alert strength a green month becomes one green rectangle.
  assert.match(cal, /color-mix\(in srgb, \$\{hue\} 12%, transparent\)/);
  assert.match(cal, /color-mix\(in srgb, \$\{hue\} 30%, transparent\)/);
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
  assert.match(cal, /flex min-h-0 flex-1 flex-col gap-4/);
  assert.match(month, /<CalRoot>/);
  assert.ok(!month.includes('className="cal"'), 'the legacy .cal wrapper is gone');
});

test('a page never writes a column width', () => {
  /* Utilities compile only under components/{ui,primitives}. RecentTrades needs three
   * column widths, and writing `w-16` there would have emitted nothing at all —
   * silently, with the row collapsing to whatever the content measured. That is the one
   * failure mode in this repo with no error message. */
  assert.match(panel, /export function PanelCell/);
  assert.match(recent, /<PanelCell width="fixed"/);
  assert.ok(!/className="[^"]*\b(w-\d|flex-1|min-w-0|shrink-0|tabular-nums)/.test(recent),
    'RecentTrades writes layout utilities, which do not compile outside the library');
});

test('the list is a list, and its rows are divided between rather than under', () => {
  // `last:border-b-0` — a border under the final row reads as a list cut off mid-scroll
  // that continues below the card, which is the one thing a "recent" list must not imply.
  assert.match(panel, /py-2\.5 text-\[13px\] leading-5 last:border-b-0/);
  assert.ok(!recentCode.includes('<table'), 'three single values a row is a list, not a table');
});

test('the panels stay presentation only', () => {
  for (const leak of ['useState', 'useEffect', 'fmtVal', 'metrics']) {
    assert.ok(!stripComments(panel).includes(leak), `panel.jsx must not know about ${leak}`);
    assert.ok(!calCode.includes(leak), `calendar.jsx must not know about ${leak}`);
  }
});
