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
    /* RHEA'S NUMBERS (2026-08-29). The card is edge-to-edge now — the header and the
     * columns carry their own 26px inset rather than the card padding everything — so
     * the row of scrolling events can bleed to the card's own border instead of stopping
     * 14px short of it. */
    ['card', /overflow-hidden rounded-\[14px\] border border-\[var\(--line\)\] bg-\[var\(--surface\)\]/],
    ['header inset', /px-\[26px\] pt-\[22px\] pb-3.5/],
    ['title', /text-\[18\.5px\] leading-7 font-\[650\] tracking-\[-0\.25px\]/],
    ['date', /text-\[13px\] leading-5 font-\[450\] text-\[var\(--muted\)\]/],
    ['two columns, wider left', /grid-cols-\[minmax\(0,1\.25fr\)_minmax\(0,1fr\)\] gap-11/],
    ['event row', /grid h-\[33px\] shrink-0 grid-cols-\[64px_max-content_auto_66px\]/],
    ['alert row', /min-h-\[73px\] shrink-0 items-center gap-2\.5 rounded-\[10px\] bg-\[var\(--row-bg\)\]/],
    ['column scroller', /max-h-\[153px\] overflow-x-hidden overflow-y-auto/],
  ];
  for (const [what, re] of geometry) {
    assert.match(brief, re, `${what} has drifted from the Rhea design`);
  }
});

test('the clock is mono, 24-hour, and ticks without re-filtering the feed', () => {
  /* TWO RESOLUTIONS, AND THE SECOND ONE IS THE POINT. Rhea's clock shows seconds, so it
   * re-renders every second. `filterBriefEvents` walks the whole feed and re-slices it
   * by importance, currency and window — running that sixty times a minute to redraw two
   * digits is work nobody asked for, and the window it computes only moves by the
   * minute. So the hook returns `now` for display and `minute` as the memo key.
   *
   * MONO IS NOT COSMETIC HERE: a proportional face makes the whole header jitter
   * sideways as the digits change width, once a second, forever. */
  assert.match(brief, /font-mono text-\[13px\] leading-5 tabular-nums/);
  assert.match(dash, /function useBriefClock\(\)/);
  assert.match(dash, /setInterval\(\(\) => setNow\(new Date\(\)\), 1000\)/);
  assert.match(dash, /minute: Math\.floor\(now\.getTime\(\) \/ 60_000\)/);
  const banner = dash.slice(dash.indexOf('export function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.ok(!/\[events, prefs, now\]/.test(banner),
    'the filter memo must key on `minute`, not on a clock that ticks every second');
});

test('the range switcher writes the real pref, not local state', () => {
  /* Rhea puts a Today / Week toggle on the events column, and the app already had a
   * four-value time window in Brief settings persisted per user through view-state. Two
   * controls for one concept that disagree after a reload is the bug view-state sync was
   * built to kill — so the toggle IS that setting seen a second time. Owner decision.
   *
   * The other two windows (4h, 24h) stay reachable in the popover: Rhea offers two
   * because two is what fits in 88px, not because the other two stopped being useful. */
  const banner = dash.slice(dash.indexOf('export function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.match(banner, /patchBriefPrefs\(\{ window: id \}\)/,
    'the toggle must write prefs.window, not component state');
  assert.match(banner, /value=\{prefs\.window\}/, 'and read back from the same place');
  assert.ok(!/useState\(['"](today|week)['"]\)/.test(banner), 'no second source of truth for the range');
});

test('an alert can be dismissed, and dismissing means marking it read', () => {
  /* The prototype clears an alert into local component state. That gives a dismissal
   * which returns on the next reload and an unread count that disagrees with the list
   * beside it — so Clear marks the notification read against the same route the
   * notification panel already uses. */
  const banner = dash.slice(dash.indexOf('export function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.match(banner, /markNotificationRead\(n\.id\)/);
  /* OFFERED ON EVERY ROW (2026-08-29). It used to be gated on `!n.read_at`, on the
   * reasoning that a read alert has nothing left to clear. Wrong for this card: the
   * brief shows read alerts too — a read `warning` still means an account is near its
   * limit — so the gate meant the rows most likely to be lingering were exactly the ones
   * with no way to dismiss them. */
  assert.ok(!/markNotificationRead && !n\.read_at/.test(banner),
    'Clear must be offered on every alert row, not only unread ones');
  const app = readSrc('App.jsx');
  assert.match(app, /markNotificationsRead\(\{ ids: \[id\] \}\)/, 'it must hit the real route');
});

test('the Clear affordance has a keyboard twin', () => {
  /* §14: every hover treatment has a keyboard twin. The prototype tracks a hovered
   * index and shows Clear for that row only, which is pointer-only — a keyboard user
   * tabbing through the brief would reach a control that is not rendered at all and
   * would have no way to dismiss anything.
   *
   * Also why it FADES rather than unmounting: a column of alerts that reflows under the
   * pointer is harder to click than one that does not. */
  assert.match(brief, /group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100/);
  // Comment-stripped — the paragraph above necessarily names the thing it forbids.
  assert.ok(!/hoverAlert|onMouseEnter/.test(briefCode),
    'hover state belongs in CSS, not in a re-render per mouseover');
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

test('rows are neutral; severity is the glyph and the word', () => {
  /* WHAT THIS USED TO PIN: that each severity's 10% wash and 20% border were
   * color-mixed from the SAME token its text used, so a hue could not drift between the
   * three. Correct then, and the mechanism is still right — it is just not what Rhea
   * draws.
   *
   * RHEA PUTS EVERY ROW ON --row-bg and carries severity in a coloured icon plus an
   * UPPERCASE WORD. Two reasons, and the second is the one that matters: three washed
   * rows in a 153px column read as one striped block and the eye stops separating them;
   * and a WORD is not a colour, so escalation survives a greyscale screen and a reader
   * who cannot separate amber from red. That is §14's rule satisfied the strong way
   * rather than the decorative way. */
  assert.match(brief, /bg-\[var\(--row-bg\)\]/, 'rows share one neutral surface');
  assert.ok(!/color-mix\(in srgb, \$\{hue\}/.test(brief), 'a severity no longer washes its row');
  // The glyph AND the label both take the hue, and the label is the redundant encoding.
  assert.match(brief, /style=\{\{ color: hue \}\}/);
  assert.match(brief, /uppercase[\s\S]{0,80}style=\{\{ color: hue \}\}[\s\S]{0,60}\{severity\}/,
    'the severity WORD must be rendered, not just its colour');

  /* THE FLAGS ARE THE ONE EXEMPTION, and it is narrow. National flag colours are
   * specified by law rather than by us; tokenising them would invite a rebrand to
   * recolour the United States. Everything OUTSIDE the Flag component still goes
   * through tokens. */
  const outsideFlags = briefCode.replace(/function Flag\(\{ code \}\) \{[\s\S]*?\n\}/, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outsideFlags), 'a colour literal appeared outside the flags');
  for (const t of ['--row-bg', '--line-chip', '--sel-bg']) {
    assert.match(tokensCss, new RegExp(`${t}\\s*:`), `${t} must be declared in the token layer`);
  }
});

test('only the three specified flags are drawn, and the code is always shown', () => {
  /* The feed publishes JPY, AUD, CAD, CHF, NZD and CNY too. Inventing six more flags
   * from memory is how a product ships a wrong flag to someone's country, so anything
   * unrecognised gets a neutral disc — and the CURRENCY CODE renders beside the flag in
   * every case, so the flag is a scanning aid and never the only thing saying which
   * market this is. */
  for (const c of ['USD', 'EUR', 'GBP']) {
    assert.ok(briefCode.includes(`code === '${c}'`), `${c} must have a flag`);
  }
  const row = brief.slice(brief.indexOf('export function BriefEvent'));
  assert.match(row, /<Flag code=\{currency\} \/>[\s\S]{0,240}\{currency\}/,
    'the code renders beside the flag, always');
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
  /* AND RHEA SETTLED IT BY DELETING IT (2026-08-29). The intermediate Figma pass drew a
   * second 36px control top-right with no icon resolved and no behaviour implied; the
   * `aside` slot existed so it could be filled the day someone decided what it did.
   * Rhea's header has one control, the settings gear, and it is labelled. So the slot is
   * gone rather than kept empty forever — an unused prop is a question nobody will
   * answer, and this comment is the answer. */
  assert.ok(!/aside/.test(briefCode), 'the unresolved second control is settled, not pending');
  assert.match(brief, /aria-label/, 'the one control it does have carries a name');
});

test('the settings control is an icon button in the title row, and still has a name', () => {
  /* IT WAS A TEXT BUTTON ON A SECOND LINE (owner call, 2026-08-28). Two things had to
   * move together and this holds both: the control is in the header's action slot
   * rather than stacked under the title, and — because the visible word "Brief
   * settings" is gone — the accessible name is now carried by an attribute. A bare
   * glyph with no label is the standard way this exact refactor breaks a control. */
  // ROUND, NOT SQUARE, AND 28px NOT 32 (Rhea): it belongs to this card rather than to
  // the app, so it is one step quieter than the top bar's 36px chrome.
  assert.match(brief, /flex size-7 shrink-0 items-center justify-center rounded-full/,
    'the trigger must be a round icon button');
  assert.doesNotMatch(brief, /flex min-w-0 flex-col gap-2/,
    'the header must be one row — no stacked second line under the title');
  const banner = dash.slice(dash.indexOf('export function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.match(banner, /<BriefAction[\s\S]*?aria-label="Brief settings"/,
    'an icon-only trigger must carry an accessible name');
  assert.doesNotMatch(banner, /Brief settings\s*<\/BriefAction>/, 'the visible label is gone');
});

test('a lone column takes the full width', () => {
  /* Brief settings can switch either SECTION off, and a single half-width list beside
   * an empty half reads as a column that failed to load rather than one the user turned
   * off.
   *
   * IT IS NO LONGER REACHED BY A COLUMN BEING EMPTY (2026-08-30) — that was the bug: a
   * trader with no unread alerts lost the alerts column and got the calendar across the
   * whole card. Both sections now render on their own toggle and show an empty state,
   * so `:only-child` fires only when the user has genuinely turned one off. */
  assert.match(brief, /\[&>\*:only-child\]:col-span-2/);
});
