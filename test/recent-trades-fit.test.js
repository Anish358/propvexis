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
 * Measured in a browser against the built CSS: cell 374, tabs 51, head 38, row 42,
 * leaving 279px for the list region — so five whole rows fit, not six.
 *
 * The count is therefore derived from the measured room rather than declared, and the
 * link sits OUTSIDE the region that flexes, which is the structural half of the fix: a
 * link that is not in the shrinking box cannot be pushed out of it.
 */

const recent = readSrc('features/trades/RecentTrades.jsx');
const panel = readSrc('components/primitives/panel.jsx');
const dashboard = readSrc('features/dashboard/Dashboard.jsx');
const workspace = readSrc('features/prop/AccountWorkspace.jsx');

test('ROW_H matches the row primitive it describes', () => {
  // 13 + 16 + 13 = 42. Browser-measured at exactly 42; if PanelTableRow's padding or
  // its cell's line-height moves, this fails rather than quietly mis-counting rows.
  const rowH = Number(/const ROW_H = (\d+)/.exec(recent)?.[1]);
  assert.equal(rowH, 42);
  // The class list sits ABOVE the data-slot in this primitive, so anchor on the
  // function and read forward.
  const row = panel.slice(panel.indexOf('export function PanelTableRow'));
  const pad = Number(/py-\[(\d+)px\]/.exec(row)?.[1]);
  assert.equal(pad, 13, 'PanelTableRow padding moved — ROW_H is now wrong');
  assert.equal(pad * 2 + 16, rowH, 'ROW_H must equal padding + the cell line-height');
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
