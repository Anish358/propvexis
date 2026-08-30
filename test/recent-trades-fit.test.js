import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc } from './helpers/src-files.js';

/* THE LIST ENDS WHERE THE CARD DOES, AND THE FOOTER LINK NEVER GIVES WAY.
 *
 * Recent trades rendered a fixed six rows, which was fine while its card had no height
 * of its own and simply grew. The card is 374px now (the design's number), and six rows
 * plus a 51px tab strip plus a 38px table header plus a 42px footer link do not fit:
 * the list pushed "View all trades" out of the bottom of the card, where it was clipped
 * and unreachable. That is what the screenshot showed.
 *
 * THE CHROME WAS ALSO TOO TALL, and that is why six rows now fit where five did.
 * Measured against the built CSS, we drew 51 (tabs) + 38 (header) + 6x46 + 50 (footer)
 * = 415 in a 374px card. It now draws 49 + 36 + 6x41 + 41 = 372, inside a 372px content
 * box — the card's own 1px border top and bottom, which the prototype's element
 * measurements do not include, is where the last pixel came from.
 *
 * Every one of those five overruns was a line-height: the prototype sets none and takes
 * the browser's `normal`, while we had written explicit `leading-*` utilities that round
 * up one or two pixels at each size — invisible per element, 42px across a card. The
 * footer's 50px had a second cause: its arrow had no size class at all, so lucide drew
 * it at its default 24px beside 12.5px type.
 *
 * The count is derived from the measured room rather than declared, and the link sits
 * OUTSIDE the region that flexes, which is the structural half of the fix: a link that
 * is not in the shrinking box cannot be pushed out of it.
 */

const recent = readSrc('features/trades/RecentTrades.jsx');
const panel = readSrc('components/primitives/panel.jsx');
const dashboard = readSrc('features/dashboard/Dashboard.jsx');
const workspace = readSrc('features/prop/AccountWorkspace.jsx');

test('ROW_H is derived from the row primitive, not asserted beside it', () => {
  /* 13 + 15 + 13 = 41, browser-measured at exactly 41. This reads BOTH halves out of
   * panel.jsx rather than restating either, because the previous version of this test
   * hardcoded a 16px line-height that the cell did not have — it passed while ROW_H was
   * wrong by 5px, which is the failure mode a pinning test exists to prevent. */
  const rowH = Number(/const ROW_H = (\d+)/.exec(recent)?.[1]);
  // The class list sits ABOVE the data-slot in this primitive, so anchor on the
  // function and read forward.
  const row = panel.slice(panel.indexOf('export function PanelTableRow'));
  const pad = Number(/py-\[(\d+)px\]/.exec(row)?.[1]);
  // The cell owns the line-height; the row owns the padding.
  const cell = panel.slice(panel.indexOf('export function PanelTableCell'));
  const lead = Number(/: 'text-\[12\.5px\] leading-\[(\d+)px\]'/.exec(cell)?.[1]);
  assert.ok(pad && lead, 'the row padding or the cell line-height is no longer readable here');
  assert.equal(pad * 2 + lead, rowH, `ROW_H should be ${pad * 2 + lead}, not ${rowH}`);
  assert.equal(rowH, 41);
});

test('six rows and the footer fit the card the design draws', () => {
  /* The whole point of bringing the chrome to the prototype's line-heights. Browser
   * measured: tabs 49, header 37, row 41, footer 41 — 49 + 37 + 6*41 + 41 = 373, in a
   * card of 374. One pixel of slack, which is the design's own margin. */
  const TABS = 49; const HEAD = 36; const LINK = 41;
  // The card is 374 with a 1px border each side, so 372 is what the content gets.
  const CONTENT = 374 - 2;
  const rowH = Number(/const ROW_H = (\d+)/.exec(recent)?.[1]);
  const need = TABS + HEAD + 6 * rowH + LINK;
  assert.ok(need <= CONTENT,
    `six rows plus chrome comes to ${need}px inside a ${CONTENT}px content box`);
  // And the footer's arrow is sized, or it draws at lucide's 24px default and the
  // footer alone eats the slack.
  assert.match(panel.slice(panel.indexOf('panel-link') - 900), /\[&_svg\]:size-3\.5/);
});

test('the row count comes from the measured room, not a constant', () => {
  assert.match(recent, /new ResizeObserver/, 'the list must react to its card resizing');
  assert.match(recent, /Math\.floor\(room \/ ROW_H\)/, 'whole rows only — a clipped half-row is a wrong count');
  // The header is inside the measured region, so it must be subtracted from it.
  assert.match(recent, /el\.clientHeight - headH/);
  assert.match(recent, /Math\.max\(1,/, 'never render zero rows, however small the box');
});

test('the footer link is outside the region that flexes', () => {
  // The structural half. PanelFill is `flex-1 min-h-0 overflow-hidden`; without
  // `min-h-0` a flex child refuses to shrink below its content and pushes its siblings
  // out of the card — which is precisely how the link went missing.
  assert.match(panel, /panel-fill[\s\S]{0,200}min-h-0[\s\S]{0,40}flex-1/);
  assert.match(panel, /panel-fill[\s\S]{0,220}overflow-hidden/);
  const card = dashboard.slice(dashboard.indexOf('function ActivityCard'), dashboard.indexOf('// Daily net cumulative'));
  const fillAt = card.indexOf('<RecentTrades');
  const linkAt = card.indexOf('<PanelLink');
  assert.ok(fillAt > -1 && linkAt > fillAt, 'the link must be a sibling AFTER the list, not inside it');
});

test('fitting is opt-in, so the scrolling caller is untouched', () => {
  /* Accounts › Details hands this `limit={14}` inside a box that is deliberately
   * `overflow-y: auto`. There the extra rows are meant to be reached by scrolling, and
   * fitting the list to the box would silently drop nine trades off a page this change
   * had no business touching. One caller wants a list that ends where its card does;
   * the other wants one you can scroll. */
  assert.match(dashboard, /<RecentTrades[^/]*fit\s*\/>/, 'the dashboard card opts in');
  assert.doesNotMatch(workspace, /<RecentTrades[^/]*\bfit\b/, 'Accounts › Details must keep scrolling');
  assert.match(workspace, /limit=\{14\}/, 'and must keep its own row cap');
  assert.match(recent, /const shown = fit \? Math\.min\(limit, fits\) : limit/,
    'without `fit` the behaviour must be exactly what it was');
});
