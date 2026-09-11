import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readSrc, stripComments } from './helpers/src-files.js';
import { legacyCss } from './helpers/app-css.js';

// The dashboard's account card — its account switcher and its footer line.
//
// Both were reported together and both are the same kind of defect: a control that
// looked finished and told the trader something untrue. The switcher's overflow panel
// opened on the far side of the page, and the footer printed a progress fraction over a
// denominator of zero.

const dash = stripComments(readSrc('Dashboard.jsx'));
/* The overflow menu's styling moved into the primitive on 2026-09-10 — see the
   tests below. A PAGE cannot hold it: a Tailwind utility written outside
   components/ emits no CSS at all, so migrating those five rules in place would
   have unstyled the menu silently. */
const account = readFileSync(
  fileURLToPath(new URL('../frontend/src/components/primitives/account.jsx', import.meta.url)),
  'utf8',
);

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
  /* `align="start"` moved INTO the panel primitive on 2026-09-10 — it is not a
     caller's choice, it is why the panel hangs under the chip's left edge instead
     of being pushed off the card by the default end-alignment. Asserted where it
     now lives. */
  assert.match(header, /<AccountMenuPanel>/);
  assert.match(account, /align="start"/, 'AccountMenuPanel dropped its start alignment');
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
  /* Still true after the 09-10 migration — the three facts are the row
     primitive's own anatomy now rather than three legacy classes at the call
     site, which is the stronger place for them. */
  assert.match(header, /<AccountMenuRow/);
  assert.match(header, /tone=\{healthStatus/, 'the row no longer gets the health tone');
  assert.match(header, /phase=\{a\.phase/, 'the row no longer gets the phase');

  const row = account.slice(account.indexOf('export function AccountMenuRow'));
  assert.match(row, /rounded-full/, 'the health dot is gone from the row');
  assert.match(row, /truncate/, 'a long account label will wrap instead of ellipsing');
});

test('the row tone is the CHIP\'s tone function, not the legacy --status class', () => {
  /* The legacy row set `--status` through a `prop-good|warn|bad` class and the dot
   * read it. It now uses `toneColor`, the same function the chip's health RING
   * uses — and the colours are IDENTICAL, which is what made the swap safe:
   * --status-good IS var(--profit), --status-warn IS var(--warning), --status-bad
   * IS var(--loss), and TONE maps to exactly those three.
   *
   * The `.prop-*` classes are NOT deleted — five other files set --status with
   * them, so this migration stopped USING one rather than removing it. */
  const row = account.slice(account.indexOf('export function AccountMenuRow'));
  assert.match(row, /toneColor\(tone\)/, 'the row invented its own colour source');
  assert.doesNotMatch(row, /prop-/, 'the row is back on the legacy tone class');
  assert.match(legacyCss, /\.prop-good \{/, 'the shared --status classes went, and five files use them');
});

test('the menu positions nothing — only how wide it may be', () => {
  /* THE SAME GUARANTEE, IN ITS NEW HOME (migrated 2026-09-10). The width is all
   * that was ever ours: Base UI owns where a portaled menu goes, and MenuContent
   * cancels the anchor width so it sizes to content — without a ceiling a long
   * account label wraps to three lines, without a floor a short one looks like a
   * tooltip.
   *
   * The old rule once carried top/left/right overrides that fought the primitive
   * for placement, so this checks the new panel for positioning utilities too. */
  /* SLICED TO THE FUNCTION, not to end-of-file. The first version ran the slice to
     the end of account.jsx and caught `absolute` in a component several hundred
     lines below — the over-broad-scan trap this cycle has now hit five times. */
  const panelAt = account.indexOf('export function AccountMenuPanel');
  const panel = account.slice(panelAt, account.indexOf('export function', panelAt + 1));
  assert.match(panel, /min-w-\[240px\] max-w-\[320px\]/, 'the panel lost its width bounds');
  for (const u of ['absolute', 'fixed', 'top-', 'left-', 'right-']) {
    assert.equal(panel.includes(u), false, `${u} belongs to the primitive, not here`);
  }

  /* AND THE LEGACY RULES ARE GONE, not merely unused: legacy CSS may only shrink,
     and a migrated screen deletes its rules in the same commit. */
  for (const name of ['dash-acct-more', 'dash-acct-more-menu', 'dash-acct-menu-row',
    'dash-acct-menu-dot', 'dash-acct-menu-name', 'dash-acct-menu-phase']) {
    assert.equal(
      legacyCss.includes(`.${name} `) || legacyCss.includes(`.${name},`)
        || legacyCss.includes(`.${name}{`), false,
      `.${name} is back in legacy/app.css — this menu is Tailwind now`,
    );
  }
  /* `.dash-acct-tab-dot` STAYS: despite the name it is not a tab, it is Prop OS's
     8px status dot in AccountWorkspace and ChallengeDetails. */
  assert.match(legacyCss, /\.dash-acct-tab-dot \{/, 'Prop OS status dot deleted with the menu');
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
