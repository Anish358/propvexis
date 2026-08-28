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
    // One step down the frame's own scale (owner call, 2026-08-28): 28->20, 24->16,
    // 18->16, 14->13. Proportions are the frame's; the card is one size smaller.
    ['card radius + padding', /rounded-\[14px\] bg-\[var\(--surface\)\] p-3.5/],
    ['blocks 12 apart', /flex flex-col gap-3 rounded-\[14px\]/],
    ['header tile', /size-8 shrink-0 items-center justify-center rounded-\[10px\]/],
    ['title', /text-\[15px\] leading-6 font-semibold/],
    ['date', /text-\[13px\] leading-5 font-normal text-\[var\(--muted\)\]/],
    ['two columns, 20 apart', /grid grid-cols-2 gap-4/],
    ['event row', /rounded-\[10px\] bg-\[var\(--brief-row-bg\)\] px-2.5 py-1.5/],
    ['alert row', /rounded-\[10px\] border px-2.5 py-2/],
    ['pill chips', /rounded-full border border-\[var\(--brief-chip-border\)\] px-1\.5 py-0\.5/],
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

test('the columns stack at 1200, not at the rail\'s 900', () => {
  /* THESE ARE TWO DIFFERENT QUESTIONS and they were briefly conflated. The rail leaves
   * the flow at 900 because a 248px rail on a phone is unusable. These columns stop
   * working at 1200 — that is where each half drops under ~380px, and an event row has
   * to hold a currency chip, a title, a time and an impact badge on ONE line. Below
   * 1200 the title truncates to nothing while the badges keep their width, so the list
   * stops being readable well before the rail stops fitting.
   *
   * Asserting the 900 is ABSENT is the half that matters: reaching for the rail's
   * number here is the mistake, and it looks tidy. */
  assert.match(brief, /max-\[1200px\]:grid-cols-1/);
  assert.doesNotMatch(brief, /max-\[900px\]/, "the brief must not borrow the rail's breakpoint");
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

test('the settings control is an icon button in the title row, and still has a name', () => {
  /* IT WAS A TEXT BUTTON ON A SECOND LINE (owner call, 2026-08-28). Two things had to
   * move together and this holds both: the control is in the header's action slot
   * rather than stacked under the title, and — because the visible word "Brief
   * settings" is gone — the accessible name is now carried by an attribute. A bare
   * glyph with no label is the standard way this exact refactor breaks a control. */
  assert.match(brief, /flex size-8 shrink-0 items-center justify-center rounded-\[6px\]/,
    'the trigger must be a square icon button');
  assert.doesNotMatch(brief, /flex min-w-0 flex-col gap-2/,
    'the header must be one row — no stacked second line under the title');
  const banner = dash.slice(dash.indexOf('export function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.match(banner, /<BriefAction[\s\S]*?aria-label="Brief settings"/,
    'an icon-only trigger must carry an accessible name');
  assert.doesNotMatch(banner, /Brief settings\s*<\/BriefAction>/, 'the visible label is gone');
});

test('a lone column takes the full width', () => {
  /* `hideEmpty` can switch either section off. A single half-width list beside an empty
   * half reads as a column that failed to load rather than one the user turned off —
   * which is exactly what the owner saw in the real shell with no calendar events. */
  assert.match(brief, /\[&>\*:only-child\]:col-span-2/);
});
