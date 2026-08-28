import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { tokensCss } from './helpers/app-css.js';

/* TODAY'S BRIEF, pinned against the 2026-08-28 Figma frame (node 1:2).
 *
 * Same division of labour as nav-rail.test.js: the headless render is what proves the
 * card LOOKS right, and these hold the decisions a render six months from now would not
 * think to question — the numbers, and the two rules that make the card safe rather
 * than merely correct.
 */

const brief = readSrc('components/primitives/brief.jsx');
const briefCode = stripComments(brief);
const dash = readSrc('features/dashboard/Dashboard.jsx');

test('the card carries the frame\'s geometry', () => {
  const geometry = [
    ['card radius + padding', /rounded-\[24px\] bg-\[var\(--surface\)\] p-7/],
    ['blocks 24 apart', /flex flex-col gap-6 rounded-\[24px\]/],
    ['header tile', /size-11 shrink-0 items-center justify-center rounded-\[16px\]/],
    ['title', /text-\[18px\] leading-7 font-semibold/],
    ['date and clock', /text-\[14px\] leading-5 font-normal text-\[var\(--muted\)\]/],
    ['two columns, 32 apart', /grid grid-cols-2 gap-8/],
    ['event row', /rounded-\[16px\] bg-\[var\(--brief-row-bg\)\] p-3/],
    ['alert row', /rounded-\[16px\] border p-4/],
    ['pill chips', /rounded-full border border-\[var\(--brief-chip-border\)\] px-2 py-0\.5/],
  ];
  for (const [what, re] of geometry) {
    assert.match(brief, re, `${what} has drifted from the Figma frame`);
  }
});

test('impact and severity are two scales, not one', () => {
  /* THE RULE THIS EXISTS FOR. An event's colour encodes IMPACT — how hard the market
   * may move. An alert's colour encodes SEVERITY — how close this account is to being
   * closed. They coincide on amber, which is exactly why collapsing them into one
   * shared `tone` prop is tempting and wrong: a medium-impact CPI print and an account
   * 1.2% from breaching would then be one value, and tuning either would tune both.
   *
   * Asserted as two separate maps because that is the shape that makes the mistake
   * impossible rather than merely discouraged. */
  assert.match(briefCode, /const IMPACT = \{/);
  assert.match(briefCode, /const SEVERITY = \{/);
  const impact = briefCode.slice(briefCode.indexOf('const IMPACT = {'));
  const severity = briefCode.slice(briefCode.indexOf('const SEVERITY = {'));
  // Every value the calendar feed can produce has a hue. A missing key falls back to
  // low/grey, which would silently downgrade a high-impact row.
  for (const k of ['high', 'medium', 'low', 'holiday']) {
    assert.match(impact.slice(0, impact.indexOf('}')), new RegExp(`\\b${k}:`), `impact.${k} is missing`);
  }
  for (const k of ['critical', 'warning', 'info']) {
    assert.match(severity.slice(0, severity.indexOf('}')), new RegExp(`\\b${k}:`), `severity.${k} is missing`);
  }
});

test('impact is never colour-only', () => {
  // The dot is what makes the column scannable; the badge is what makes it readable to
  // anyone who cannot separate red from amber. Dropping the badge would leave impact
  // encoded in an 8px dot and nothing else.
  assert.match(brief, /impactLabel &&/, 'the impact badge must survive');
  assert.match(dash, /const IMPACT_LABEL = \{ high: 'High', medium: 'Medium', low: 'Low', holiday: 'Holiday' \}/);
  assert.match(dash, /impactLabel=\{IMPACT_LABEL\[e\.impact\]\}/);
});

test('the washes are mixed from the token, not hand-picked', () => {
  /* color-mix from the SAME custom property the text uses, so a severity has exactly
   * one hue and the 10%-fill / 20%-border relationship survives a palette change. Three
   * hand-written rgba() triples would drift the first time --loss moved — which it just
   * did, in the same redesign that produced this card. */
  assert.match(brief, /color-mix\(in srgb, \$\{hue\} 10%, transparent\)/);
  assert.match(brief, /color-mix\(in srgb, \$\{hue\} 20%, transparent\)/);
  assert.match(brief, /color-mix\(in srgb, \$\{hue\} 15%, transparent\)/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(brief), 'a colour literal appeared in the brief');
  for (const t of ['--brief-tile-bg', '--brief-row-bg', '--brief-chip-border']) {
    assert.match(tokensCss, new RegExp(`${t}\\s*:`), `${t} must be declared in the token layer`);
  }
});

test('the card stacks below 900px, at the same breakpoint as the rail', () => {
  // Two 645px columns do not survive a phone, and neither does a half-width event row
  // carrying a currency, a title, a time and a badge on one line. Same breakpoint as
  // the rail's drawer so the shell reorganises once rather than twice.
  assert.match(brief, /max-\[900px\]:grid-cols-1/);
});

test('the brief is presentation only — the feed and the prefs stay in Dashboard', () => {
  for (const leak of ['fetchCalendar', 'briefPrefs', 'filterBriefEvents', 'useEffect', 'useState']) {
    assert.ok(!briefCode.includes(leak), `brief.jsx must not know about ${leak}`);
  }
  // And the page writes no utilities — outside components/{ui,primitives} they compile
  // to nothing, silently.
  const banner = dash.slice(dash.indexOf('export function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.ok(!/className="[^"]*\b(flex|grid|gap-|p-|px-|py-|text-\[|bg-\[|rounded-)/.test(banner),
    'DailyBanner writes Tailwind utilities, which do not compile outside the component library');
});

test('the frame\'s unlabelled second button is deliberately not built', () => {
  /* The frame draws a 36px control top-right of the header with no icon resolved and no
   * behaviour implied, next to a settings control that is already there and labelled.
   * `aside` exists as a slot so it can be filled the day someone decides what it does;
   * shipping a button that does nothing is worse than shipping no button. This asserts
   * the slot survives — if it is deleted, the decision is lost with it. */
  assert.match(brief, /aside/, 'the header must keep a slot for the frame\'s second control');
  assert.ok(!/aside=\{/.test(dash), 'nothing should fill `aside` until it has a purpose');
});
