import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { legacyCss } from './helpers/app-css.js';

// The dashboard's account card — its account switcher and its footer line.
//
// Both were reported together and both are the same kind of defect: a control that
// looked finished and told the trader something untrue. The switcher's overflow panel
// opened on the far side of the page, and the footer printed a progress fraction over a
// denominator of zero.

const dash = stripComments(readSrc('Dashboard.jsx'));

// ---------------------------------------------------------------------------
// The overflow menu
// ---------------------------------------------------------------------------

test('the account overflow is the Menu primitive, not a hand-positioned panel', () => {
  /* IT OPENED OVER THE SIDEBAR. The panel was `position: absolute` inside a wrapper that
   * never declared `position: relative`, so it resolved against whatever ancestor
   * happened to be positioned and landed nowhere near its trigger. And `AccountTabs` is
   * an `overflow-x-auto` scroller, which clips anything absolutely positioned inside it
   * — so even correctly anchored it would have been cut off at the strip's edge.
   * A portaled menu cannot hit either. */
  const header = dash.slice(dash.indexOf('function AccountHeader'), dash.indexOf('function SetTargetModal'));
  assert.match(header, /<Menu>/);
  assert.match(header, /<MenuTrigger render=\{<AccountTabMore \/>\}>/);
  assert.match(header, /<MenuContent align="start"/);
  assert.match(header, /<MenuItem key=\{a\.account_id\}/);

  assert.equal(/wcz-menu/.test(header), false, 'the hand-rolled panel is gone');
  assert.equal(/wcz-opt/.test(header), false);
  assert.equal(/position: absolute/.test(header), false);
});

test('the switcher keeps no open-state or outside-click machinery of its own', () => {
  // Escape, focus return, arrow keys and dismissal are the primitive's now. A leftover
  // `mousedown` listener would be a second, disagreeing way to close the same menu.
  const header = dash.slice(dash.indexOf('function AccountHeader'), dash.indexOf('function SetTargetModal'));
  assert.equal(/setOpen/.test(header), false, 'open state belongs to the primitive');
  assert.equal(/addEventListener\('mousedown'/.test(header), false);
});

test('a menu row carries the same three facts as the chip beside it', () => {
  // Health, name, phase — in that order, so a row and a tab are the same object at two
  // sizes rather than two designs for one thing.
  const header = dash.slice(dash.indexOf('function AccountHeader'), dash.indexOf('function SetTargetModal'));
  assert.match(header, /healthStatus\(a\.health\.score, a\.breach\.breached\)/);
  assert.match(header, /dash-acct-menu-row prop-\$\{st\}/);
  assert.match(header, /dash-acct-menu-dot/);
  assert.match(header, /dash-acct-menu-name/);
  assert.match(header, /dash-acct-menu-phase/);
});

test('the menu CSS positions nothing — only how wide a row may be', () => {
  const rule = legacyCss.match(/\.dash-acct-more-menu \{[^}]*\}/);
  assert.ok(rule, '.dash-acct-more-menu must still declare a width');
  assert.match(rule[0], /min-width/);
  // The old `top`/`left`/`right` overrides fought the primitive for placement.
  for (const prop of ['top:', 'left:', 'right:', 'position:']) {
    assert.equal(rule[0].includes(prop), false, `${prop} belongs to the primitive now`);
  }
  // The dot reads the shared tone variable rather than naming a colour.
  assert.match(legacyCss, /\.dash-acct-menu-dot \{[^}]*background: var\(--status\)/);
});

// ---------------------------------------------------------------------------
// The trading-days footer
// ---------------------------------------------------------------------------

test('no minimum trading days means a sentence, not a fraction over zero', () => {
  /* It read "7/0 days completed · Minimum trading days requirement" for a firm that asks
   * for no minimum — a denominator of zero presented as progress, under a label naming a
   * rule the account does not have. */
  const foot = dash.slice(dash.indexOf('<AccountCardFoot'), dash.indexOf('</AccountCardFoot>'));
  assert.match(foot, /days\.has \?/, 'the fraction is conditional');
  assert.match(foot, /No minimum trading days required/);
});

test('the footer states the VERDICT once the requirement is met', () => {
  // "Minimum trading days requirement" beside 3/3 names the rule without answering it,
  // leaving the trader to do the comparison the app has already done.
  const foot = dash.slice(dash.indexOf('<AccountCardFoot'), dash.indexOf('</AccountCardFoot>'));
  assert.match(foot, /\{days\.count\}/);
  assert.match(foot, /days\.met \? 'Minimum trading days met' : 'Minimum trading days requirement'/);
});

test("Prop OS's trading-days KPI reads the same helper, not its own arithmetic", () => {
  // The identical defect one surface over, on the card that answers the same question.
  const kpis = stripComments(readSrc('AccountKpiCards.jsx'));
  const card = kpis.slice(kpis.indexOf('export function TradingDaysCard'));
  assert.match(card, /tradingDaysRead\(d\)/);
  assert.match(card, /days\.has \? days\.count : 'None required'/);
  // The days actually traded are still worth knowing, so they move to the context line
  // rather than being dropped.
  assert.match(card, /'Days traded'/);
});
