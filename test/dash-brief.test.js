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

test('a capped list SHOWS its scrollbar — the only affordance the columns have', () => {
  /* Both columns cap at 153px, so a fifth economic event and a third account alert are
   * present, scrollable, and — until 2026-09-01 — completely unannounced.
   * legacy/app.css hides native scrollbar chrome on `*` ("standard in this class of
   * app"), which is right for the page body and wrong here: there is no fade, no
   * chevron and no "+2 more" in this card, so the scrollbar IS the affordance. The
   * source comment on the scrolling box says exactly that.
   *
   * The fix is opt-in rather than a global un-hide: a box asks with `data-scroll`.
   *
   * `scrollable` JOINED THE CONDITION 2026-09-03, and it is measured, not assumed. Four
     event rows come to EXACTLY the 153px cap (4x33 + 3x7), so sub-pixel rounding was
     enough to render a thumb that filled its whole track and could not move — the thing
     scrollbars.css calls "worse than no thumb at all". The affordance this test protects
     is unchanged: a list with more rows than fit still asks for its bar. */
  assert.match(briefCode, /data-scroll=[{]scroll && scrollable [?] 'y' : undefined[}]/,
    'the capped list must opt in when it OVERFLOWS — and must NOT when scroll={false}');
  assert.match(briefCode, /box\.scrollHeight > box\.clientHeight \+ 1/,
    'the overflow must be measured, with a pixel of tolerance for rounding');
  // scroll={false} is the skeleton's: a scrollbar on placeholder rows is a lie about
  // content that does not exist yet. The ternary above is what keeps that true.
  assert.match(dash, /scroll=[{]false[}]/);

  /* THE STYLES ARE UNLAYERED, WHICH IS THE ONLY REASON THEY APPLY. legacy/app.css is
   * imported into layer(legacy) — the first layer declared, so it loses to every
   * unlayered rule at any specificity. Dropping this import into a layer, or ordering
   * it before tokens.css, makes the whole file a silent no-op. token-bridge.test.js
   * pins the import; this pins the declarations. */
  const css = readSrc('styles/scrollbars.css');
  // `display: block` is not redundant: a width cannot revive a pseudo-element that
  // another rule has set to `display: none`.
  assert.ok(css.includes('display: block;'),
    'the 8px track must explicitly undo the global display:none');
  assert.ok(css.includes('width: 8px;'));
  // The prototype's own numbers: an 8px track, a 2.5px transparent border and
  // background-clip make a 3px thumb that still has an 8px hit target.
  assert.ok(css.includes('border: 2.5px solid transparent;'));
  assert.ok(css.includes('background-clip: padding-box;'));
  assert.ok(css.includes('border-radius: 99px;'));
  // Firefox gets the same thing through the standard properties, or the two engines
  // disagree — which is precisely why the prototype's hover-only webkit thumb and the
  // design screenshots did not match each other.
  assert.ok(css.includes('scrollbar-width: thin;'));
  assert.ok(css.includes('scrollbar-color: var(--line-chip) transparent;'));
  // Tokenised, not the prototype's literals — COLOUR-INVENTORY §6 rules that these
  // become no new tokens. #2a2a30 is --line-chip.
  // The DECLARATIONS only: the file's header quotes the prototype's rule verbatim, so
  // a raw scan would match the citation it exists to explain.
  const decls = css.replace(/[/][*][\s\S]*?[*][/]/g, '');
  assert.ok(!/#2a2a30|#26262b/.test(decls), 'the prototype literals must resolve to tokens');
  assert.match(tokensCss, /--line-chip: #2a2a30/);
  // Always visible, then INTENSIFIED on hover (§7) — never conjured by it. You cannot
  // discover that a list scrolls by hovering a list you do not know scrolls.
  assert.ok(css.includes('background: var(--line-chip);'));
  assert.ok(css.includes(':hover::-webkit-scrollbar-thumb'));
  assert.ok(css.includes('background: var(--line-hover);'));
});

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
    /* `shrink-0` MOVED OFF THIS ROW ON 2026-09-03 and the row's own geometry is
       otherwise untouched. A dismissed alert now collapses its height on the way out,
       which needs a grid wrapper around the row — so the wrapper became the flex child
       and inherited the `shrink-0` that stops the list squashing its rows. Leaving a
       dead `shrink-0` on an element that is no longer a flex child would have kept this
       regex green while meaning nothing. The wrapper is asserted on the next line, so
       the guarantee — a brief alert never shrinks — still has a test. */
    ['alert row', /min-h-\[73px\] items-center gap-2\.5 rounded-\[10px\] bg-\[var\(--row-bg\)\]/],
    ['alert exit wrapper', /'grid shrink-0',\s*\n\s*EXIT_MOTION,/],
    /* `overflow-hidden` IS THE RESTING STATE SINCE 2026-09-03, not `overflow-y-auto`.
       scrollbars.css owns `overflow-y` from an unlayered file and turns this box into a
       scroller when `data-scroll` is present — so the class here is what clips a list
       that has NOT earned a bar, and no utility written in this file could override that
       rule anyway. The 153px cap is unchanged and is what this pins. */
    ['column box', /max-h-\[153px\] overflow-hidden max-\[1200px\]:max-h-none/],
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
  /* THE CALL MOVED BEHIND `clearAlert` ON 2026-09-03, and the guarantee is unchanged:
     Clear still writes to the server, it is just no longer the first thing that happens.
     The row now animates out, and it has to stay MOUNTED while it does — marking it read
     immediately would drop it from the derived list mid-collapse. So `clearAlert` holds
     the id, plays the exit, and writes the read at the end.

     Both halves are asserted, because either alone would pass while the feature was
     broken: the row must call `clearAlert`, and `clearAlert` must reach
     `markNotificationRead`. A dismissal that only animates is exactly the local-state
     clear this test was written to prevent — it would return on the next reload. */
  assert.match(banner, /onClear=\{markNotificationRead \? \(\) => clearAlert\(n\.id\) : undefined\}/);
  assert.match(banner, /markNotificationRead\?\.\(id\)/, 'clearAlert must still write the read');
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
  for (const leak of ['fetchCalendar', 'briefPrefs', 'filterBriefEvents']) {
    assert.ok(!briefCode.includes(leak), `brief.jsx must not know about ${leak}`);
  }

  /* THE HOOK BAN WAS NARROWED 2026-09-03 — narrowed, not dropped, and this is the whole
   * reasoning so it can be reversed if the judgement was wrong.
   *
   * It used to list `useState` and `useEffect` alongside the three data leaks above, as
   * a proxy for "this component holds nothing". That proxy broke when the Today/Week
   * switcher started sliding its pill: positioning the pill means MEASURING the active
   * button, because the two labels are different widths and the alternative — equal
   * segments — would resize the control, which §2 forbids in visual work. A measurement
   * of this component's own DOM is not product state. Neither is the latch that stops
   * the calendar column fading on its first paint.
   *
   * So the rule is asserted DIRECTLY instead of by proxy, and the direct form is
   * stronger: brief.jsx may import nothing but React and `cn`, and may not call `fetch`.
   * It therefore cannot reach a feed, a pref, a route or a domain module however many
   * hooks it holds — which is what "presentation only" always meant. Counting hook names
   * never guaranteed that; an import list does. */
  const sources = [...briefCode.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(sources)].sort(), ['@/lib/utils', 'react'],
    'brief.jsx may import only React and cn — anything else is domain reaching into a presentation component');
  assert.ok(!/\bfetch\s*\(/.test(briefCode), 'brief.jsx must not fetch');
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
