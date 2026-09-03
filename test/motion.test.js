import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSrc, readCode } from './helpers/src-files.js';
import { bridgeCss, legacyCss, tokensCss } from './helpers/app-css.js';

/* MOTION ON THE ACCOUNT HEALTH CARD — DESIGN-LANGUAGE §10, applied.
 *
 * §10 was written and locked before anything on this card moved. These pin the four
 * things about applying it that are easy to get wrong and impossible to see in a
 * screenshot: that the durations come from the tokens rather than from Tailwind, that
 * the one geometric animation cannot lie about WHICH account it is drawing, that no
 * figure animates, and that reduced-motion support is real rather than assumed.
 */

const account = readSrc('components/primitives/account.jsx');
const accountCode = readCode('components/primitives/account.jsx');
const details = readCode('features/prop/AccountDetails.jsx');
// The raw file too: one assertion below is about a COMMENT that has to stay put, and
// readCode strips exactly those. See the helper's own note on the two readers.
const detailsSrc = readSrc('features/prop/AccountDetails.jsx');
const dash = readCode('features/dashboard/Dashboard.jsx');

const motionConst = (name) => accountCode.match(new RegExp(`const ${name} = '([^']+)'`));

// ---------------------------------------------------------------------------
// §10: two durations and one easing, and they come from the tokens
// ---------------------------------------------------------------------------

test('the card composes every transition from the three named motion constants', () => {
  /* A BARE `transition-colors` IS NOT SPEC-COMPLIANT, which is the whole point here.
   * Tailwind's own default is 150ms on its own cubic-bezier — near enough to `--dur`
   * (200ms) that nobody spots it by eye, and different enough that the app would be
   * running two easing curves. §10 says ONE. Naming the three combinations once and
   * banning inline transition utilities is what keeps that from drifting a class at a
   * time, and bridge.css makes the identical argument about the overlays. */
  const inline = accountCode.match(/'[^']*\btransition-[^']*'/g) || [];
  const declared = inline.filter((s) => !/^'transition-(colors|\[width,background-size\]) duration-/.test(s));
  assert.deepEqual(declared, [], 'compose transitions from STATE_MOTION / HOVER_MOTION / FILL_MOTION');
});

test('each motion constant names a token duration and the token easing', () => {
  for (const name of ['STATE_MOTION', 'HOVER_MOTION', 'FILL_MOTION']) {
    const m = motionConst(name);
    assert.ok(m, `missing motion constant ${name}`);
    assert.match(m[1], /\bduration-\[var\(--dur(-fast|-slow)?\)\]/, `${name} has no token duration`);
    assert.match(m[1], /\bease-\[var\(--ease\)\]/, `${name} has no token easing`);
  }
});

test('reporting a change runs at --dur-slow, acknowledging a click at --dur-fast', () => {
  /* §10's split is meaning, not taste. A bar travelling or a threshold crossing is the
   * card reporting something about the account; a hover or a selection is the card
   * acknowledging a pointer. Collapsing the two onto one duration is how motion stops
   * carrying information — and a 400ms hover fade just feels broken.
   *
   * STATE_MOTION AND FILL_MOTION MUST MATCH. They fire together when a fill crosses 90%
   * — the bar grows past the wall as the cell washes red — so a split would land the
   * colours a full 200ms before the bar they belong to. */
  assert.match(motionConst('STATE_MOTION')[1], /duration-\[var\(--dur-slow\)\]/);
  assert.match(motionConst('FILL_MOTION')[1], /duration-\[var\(--dur-slow\)\]/);
  assert.match(motionConst('HOVER_MOTION')[1], /duration-\[var\(--dur-fast\)\]/);
});

test('tokens.css defines all three durations and the easing', () => {
  // A motion class pointing at a token that no longer exists resolves to nothing, and
  // the transition silently becomes instant — no error, no warning, no visible bug
  // report beyond "it feels different now".
  for (const tok of ['--dur-fast:', '--dur:', '--dur-slow:', '--ease:']) {
    assert.ok(tokensCss.includes(tok), `tokens.css no longer defines ${tok}`);
  }
});

test('§10 carries the amendment that made a third duration legal', () => {
  /* §10 IS LOCKED, and it read "two durations" until 2026-09-03. Adding --dur-slow to
   * tokens.css without amending the rule would leave the locked document contradicting
   * the tokens it governs — which is how a design system quietly stops being one.
   * §21 requires four things for an override: the rule, the reason, the token it lives
   * in, and the test that holds it. This is the fourth. */
  const dls = readFileSync(new URL('../docs/design/DESIGN-LANGUAGE.md', import.meta.url), 'utf8');
  assert.match(dls, /Three durations and one easing/);
  assert.match(dls, /`--dur-slow` \(400ms\) is for a VALUE TRAVELLING/);
  assert.ok(!/Two durations and one easing/.test(dls), '§10 still claims two durations');
});

// ---------------------------------------------------------------------------
// The bar is the only thing that moves, and it must not lie
// ---------------------------------------------------------------------------

test('the meter fill transitions width and background-size together', () => {
  /* THE RAMP IS STRETCHED TO (100/fill)x100%, so the gradient's scale is a function of
   * the fill. Easing `width` while `background-size` snapped would leave the bar wearing
   * the wrong slice of the yellow->orange->red ramp for the whole transition — the
   * colour arriving before the bar it describes. They move together or neither moves. */
  assert.match(motionConst('FILL_MOTION')[1], /transition-\[width,background-size\]/);
});

test('the meter animates no figure and loops nothing', () => {
  /* NO COUNT-UP, NO SWEEP-IN. A trader opens this card to read three numbers under time
   * pressure, and a figure animating toward its value is unreadable for exactly as long
   * as the animation runs. §10 also says animation SETTLES: the stop-trading banner is
   * the app's one looping exception, so `pv-breathe` may appear in this file — but only
   * up there, never in a meter. Sliced at Meter's own boundaries so the banner is not
   * what is being tested. */
  const start = accountCode.indexOf('export function Meter(');
  const end = accountCode.indexOf('export function AccountCardFoot');
  assert.ok(start > 0 && end > start, 'Meter moved — this slice found nothing');
  const meter = accountCode.slice(start, end);
  assert.ok(!meter.includes('animate-'), 'a meter must not run a keyframe animation (§10: animation settles)');
});

// ---------------------------------------------------------------------------
// The account switch: the bars travel (owner decision, 2026-09-03)
// ---------------------------------------------------------------------------

test('the meter row is not keyed, so the bars tween across an account switch', () => {
  /* THE OWNER CHOSE THE TWEEN, over a recorded objection, and this pins it so nobody
   * "fixes" it back on the strength of the argument alone.
   *
   * The argument, for whoever reads this next: a transition asserts that the thing it
   * moves is the same thing it was a moment ago, and these bars measure ONE account's
   * consumed drawdown. Travelling from the 15K's 66.7% to the 25K's 33.3% draws a
   * downward sweep — the most reassuring motion this card can make — on a click that
   * changed nothing about the trader's risk. Weighed against a row fade and a
   * grow-from-zero, the owner picked the conventional tween as least surprising.
   *
   * So this test is a tripwire in BOTH directions. Adding `key={data.account_id}` back
   * is a product decision, not a cleanup — it must come with the owner, not with a
   * passing build. */
  assert.ok(!/<MeterRow[^>]*\bkey=/.test(details), 'MeterRow must stay un-keyed — the bars are meant to travel');
  assert.match(detailsSrc, /NOT KEYED ON THE ACCOUNT/, 'the reasoning must stay recorded at the call site');
});

test('the tween is the fill transition, so it runs at --dur-slow on the token curve', () => {
  // With no remount, FILL_MOTION is the only thing making the switch legible. If it
  // ever loses its duration the bars snap between two accounts with no motion at all —
  // the worst of both choices, and invisible in a screenshot.
  assert.equal(motionConst('FILL_MOTION')[1], 'transition-[width,background-size] duration-[var(--dur-slow)] ease-[var(--ease)]');
});

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------

test('the global prefers-reduced-motion reset still exists', () => {
  /* §10: "durations collapse to zero, the state change still happens". Nothing on this
   * card implements that itself — the whole app leans on ONE global rule in legacy CSS,
   * and legacy CSS is scheduled for deletion (CLAUDE.md). Deleting it would strip
   * reduced-motion support from every surface at once, with no error and no visible
   * change for anyone who does not use the setting. This is the tripwire.
   *
   * It wins from `layer(legacy)`, the LOWEST layer, because `!important` REVERSES layer
   * precedence — so it outranks every normal declaration Tailwind emits. Drop the
   * `!important` and the reset quietly stops working. */
  const reset = legacyCss.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{[^}]*\}/);
  assert.ok(reset, 'the global prefers-reduced-motion reset is gone from legacy/app.css');
  assert.match(reset[0], /animation-duration:\s*\.001ms\s*!important/);
  assert.match(reset[0], /transition-duration:\s*\.001ms\s*!important/);
});

test('account.jsx records that it leans on the global reset instead of its own', () => {
  // A comment, not code — so readSrc, not readCode. The next person to add a transition
  // to this file needs to know why there is no media query anywhere in sight.
  assert.match(account, /REDUCED MOTION IS NOT HANDLED HERE/);
});

// ---------------------------------------------------------------------------
// ENTRANCES — overlays, the reload-only page fade, late content, empty states
// ---------------------------------------------------------------------------

const twEntry = readFileSync(new URL('../frontend/src/tailwind.css', import.meta.url), 'utf8');
const entrance = readSrc('components/primitives/page-entrance.jsx');
const layout = readCode('app/Layout.jsx');

test('tw-animate-css is imported, so the overlay classes are not dead text', () => {
  /* THE DEPENDENCY WAS IN package.json AND IMPORTED NOWHERE, which meant every
   * `data-open:animate-in` / `fade-in-0` / `zoom-in-95` shadcn ships on the generated
   * dialog, dropdown, popover and tooltip matched no rule at all. The markup claimed an
   * animation; the stylesheet had none; nothing errored. §10 recorded the modal entrance
   * as OPEN and wizard.jsx routed around it — both were describing this missing line.
   *
   * NOT INSIDE `layer(...)`. `@utility` must be top level for Tailwind v4 to register
   * it; wrapped in a layer the declarations are accepted and silently emit nothing,
   * which is the same failure again one level down. */
  assert.match(twEntry, /^@import "tw-animate-css";$/m,
    'tw-animate-css must be imported, unlayered');
});

test('the app modal actually has the entrance §10 now promises', () => {
  /* IMPORTING THE LIBRARY WAS NOT ENOUGH, which is the trap here. The generated
   * components/ui/dialog.jsx went live with the import — but the app's Modal shell does
   * not use it. It renders Base UI Dialog wearing the LEGACY .modal-backdrop / .modal
   * classes, and legacy CSS has no entrance, so all thirteen dialogs would still appear
   * instantly while §10 claimed they faded. A locked rule the code does not honour is
   * worse than an OPEN item, because it stops anyone looking.
   *
   * overlay-motion, NOT a duration utility: it sets --tw-animation-duration, which
   * tw-animate-css reads before --tw-duration, so the enter/leave split wins by variable
   * precedence. The backdrop fades only — a scrim is the room dimming, not an object
   * arriving, and scaling it would drag the viewport. */
  const modal = readCode('components/primitives/modal.jsx');
  assert.match(modal, /const BACKDROP_MOTION = .overlay-motion data-open:animate-in data-open:fade-in-0/);
  assert.match(modal, /const POPUP_MOTION = .overlay-motion data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95/);
  assert.ok(!/BACKDROP_MOTION = '[^']*zoom/.test(modal), 'the scrim must not scale');
  assert.match(modal, /[backdrop, BACKDROP_MOTION]/);
  assert.match(modal, /POPUP_MOTION, className]/);
});

test('§10 closes the modal entrance rather than still listing it OPEN', () => {
  // §21: closing an OPEN item needs a decision recorded in the document and a test in
  // the same commit. This is the test half.
  const dls = readFileSync(new URL('../docs/design/DESIGN-LANGUAGE.md', import.meta.url), 'utf8');
  const s10 = dls.slice(dls.indexOf('## §10 Motion'), dls.indexOf('## §11'));
  assert.ok(s10.length > 0, '§10 moved — this slice found nothing');
  assert.ok(!/⬜ OPEN/.test(s10), '§10 still carries an OPEN item');
  assert.match(s10, /AN OVERLAY ENTERS; IT DOES NOT ARRIVE/);
});

test('the page entrance fires once per browser load, not on every route change', () => {
  /* THE SCOPE IS THE FEATURE. An ordinary mount animation would replay on every
   * client-side navigation between Dashboard, Prop OS and Settings — which is the
   * version worth refusing, because it delays the figures on every screen a trader
   * opens. Module scope is evaluated once per document, so the flag is false exactly
   * once and a real reload plays it again.
   *
   * THE FLAG MUST BE SET IN AN EFFECT, NOT THE useState INITIALIZER. An initializer has
   * to be pure — StrictMode calls it twice in development and may discard the first
   * result — so flipping the module boolean there would make the entrance fire or not
   * depending on a double-invoke. That bug would never appear in the build anyone
   * tests. */
  assert.match(entrance, /^let booted = false;$/m, 'the gate must be module scope, not a ref or state');
  assert.match(entrance, /const \[first\] = useState\(\(\) => !booted\);/);
  assert.match(entrance, /useEffect\(\(\) => \{ booted = true; \}, \[\]\);/);
  assert.ok(!/booted = true/.test(entrance.slice(entrance.indexOf('useState(() =>'), entrance.indexOf('useEffect'))),
    'the useState initializer must stay pure');
});

test('the entrance is claimed by whoever PLAYS it, never by whatever rendered first', () => {
  /* THE BUG THIS PINS SHIPPED AND WAS CAUGHT IN A SCREENSHOT. The first version froze the
   * answer in a context provider at first paint, which on a cold load meant the DASHBOARD
   * SKELETON consumed the app's one arrival: the page sat empty behind the cascade's
   * delays, then the real content tore it down mid-flight and arrived on a different
   * motion. Two competing entrances on the same boxes.
   *
   * There is no provider now — a frozen answer is exactly the wrong shape. Each consumer
   * reads the live module flag at its own mount, and the hook that renders a cascade is
   * what claims it. Re-introducing a provider re-introduces the flicker. */
  assert.ok(!/EntranceProvider|createContext/.test(entrance),
    'a provider freezes the answer at first paint — that is the flicker');
  assert.ok(!/EntranceProvider/.test(layout));
  assert.match(entrance, /export function useSectionEntrance\(\) \{\s*\n\s*const \[first\] = useState\(\(\) => !booted\);\s*\n\s*useEffect\(\(\) => \{ booted = true; \}, \[\]\);/);
});

test('the first NAVIGATION ends the arrival, played or not', () => {
  /* WITHOUT THIS, DEEP-LINKING TO PROP OS AND THEN CLICKING DASHBOARD CASCADES — on a
   * client-side navigation, which is the one thing this component exists to refuse. Prop
   * OS never calls the cascade hook, so nothing would have claimed the flag.
   *
   * DERIVE-DURING-RENDER, NOT AN EFFECT, and the ordering is the whole reason: React
   * renders top-down, so writing the flag in this parent's body happens BEFORE the routed
   * page below renders and reads it. In an effect it would be too late — child effects run
   * before parent effects, so the incoming page would already have decided to cascade. */
  assert.match(entrance, /if \(seen !== pathname\) \{\s*\n\s*setSeen\(pathname\);\s*\n\s*booted = true;\s*\n\s*\}/);
  assert.match(entrance, /const \{ pathname \} = useLocation\(\);/);
});

test('the flat page fade survives as the fallback for every unmigrated page', () => {
  /* Prop OS, Settings, the Trade Log and the Journal have not opted into a cascade, and
   * must not silently lose their entrance because the dashboard gained a better one. */
  assert.match(entrance, /animate-\[pv-content-in_var\(--dur\)_var\(--ease\)_backwards\]/);
  assert.match(entrance, /export function PageEntrance/);
});

test('the dashboard does not fade itself in ON TOP of its own cascade', () => {
  /* IT DID, AND IT WAS HALF THE FLICKER. The page was wrapped in a `ContentArrival`,
   * which fades the whole thing as one block — a second, competing statement laid over
   * the sections staggering in underneath it. The cascade IS this page's arrival now.
   *
   * ContentArrival stays in the primitives with no caller, deliberately: a flat fade is
   * still the right answer for a surface with no sections to stagger, and the case
   * returns the moment another page grows a late fetch. Its header says so, so nobody
   * deletes it as dead or re-wraps the dashboard in it. */
  assert.ok(!/ContentArrival/.test(dash), 'the cascade is the arrival — do not fade over it');
  assert.match(dash, /if \(tradesLoading\) \{/, 'the skeleton must stay a separate branch');
  assert.match(entrance, /NO CALLER TODAY, and that is deliberate/);
  assert.match(entrance, /IT IS NOT A DECORATION FOR EVERY BLOCK/);
});

test('empty states fade in', () => {
  // The one surface with no figures to read, so the objection that governs everywhere
  // else on the dashboard has nothing to bite on.
  const empty = readCode('components/primitives/empty-state.jsx');
  assert.match(empty, /const ENTRANCE = 'animate-\[pv-content-in_var\(--dur\)_var\(--ease\)_backwards\]';/);
  assert.match(empty, /cx\('u-empty', ENTRANCE, className\)/);
});

test('the wizard keeps @starting-style and says why it is not a contradiction', () => {
  /* Its `animate-in` note was a WORKAROUND comment that became false the moment the
   * library was imported. A stale comment explaining a constraint that no longer exists
   * is worse than none: the next reader treats a live option as a closed door. */
  const wiz = readSrc('components/primitives/wizard.jsx');
  assert.match(wiz, /starting:opacity-0/);
  assert.ok(!/`animate-in` and `fade-in` compile to NO CSS/.test(wiz), 'the stale workaround note must be corrected');
  assert.match(wiz, /SO WHY NOT SWITCH\?/);
  assert.match(wiz, /duration-\[var\(--dur\)\] ease-\[var\(--ease\)\]/, 'the wizard entrance must name our easing');
});

// ---------------------------------------------------------------------------
// TODAY'S BRIEF — the range switcher, the calendar swap, the alert exit
// ---------------------------------------------------------------------------

const brief = readCode('components/primitives/brief.jsx');
const briefConst = (name) => brief.match(new RegExp(`const ${name} = '([^']+)'`));

test('the brief composes every transition from its named motion constants', () => {
  // Same rule as the account card: a bare `transition-colors` silently runs Tailwind's
  // 150ms on Tailwind's curve, which is a second easing curve in an app §10 says has one.
  const inline = brief.match(/'[^']*\btransition-[^']*'/g) || [];
  const declared = inline.filter((s) => !/^'transition-(colors|opacity|\[transform,width\]|\[grid-template-rows,opacity\]) duration-/.test(s));
  assert.deepEqual(declared, [], 'compose transitions from the MOTION constants at the top of brief.jsx');
});

test('the brief never reaches for --dur-slow', () => {
  /* §10 reserves 400ms for a VALUE TRAVELLING along a path. The range pill travels, but
   * it is a selection indicator rather than a quantity — and a 400ms toggle reads as an
   * app that did not hear the click. This is the rule's first real test: --dur-slow is
   * the kind of token that spreads by imitation if nothing stops it. */
  assert.ok(!/--dur-slow/.test(brief), 'brief.jsx must not use --dur-slow; see §10');
});

test('the range pill slides, and transform carries width with it', () => {
  /* "Today" and "Week" are different widths, so the pill has to animate its WIDTH as
   * well as its position — otherwise it arrives at the right place at the wrong size and
   * snaps. They are one movement and must share one transition. */
  assert.equal(briefConst('SLIDE_MOTION')[1], 'transition-[transform,width] duration-[var(--dur-fast)] ease-[var(--ease)]');
});

test('the pill is measured from the DOM, not assumed to be a percentage', () => {
  /* A percentage translate only lands correctly if the segments are equal width, and
   * making them equal would resize the control — §2 forbids that in visual work. So the
   * active button is measured.
   *
   * THE ResizeObserver IS NOT OPTIONAL. Geist is a webfont: the first measurement can
   * happen in the fallback face, and when the real one loads the labels reflow and leave
   * the pill visibly misaligned with nothing to correct it. */
  assert.match(brief, /useLayoutEffect/);
  assert.match(brief, /offsetLeft/);
  assert.match(brief, /offsetWidth/);
  assert.match(brief, /new ResizeObserver\(measure\)/);
});

test('the pill does not fly in on first paint', () => {
  // The first measurement is a position arriving from nothing, not a selection moving.
  // Without the gate the pill slides in from the left edge every time the dashboard
  // paints, which reads as a loading artefact.
  assert.match(brief, /ready && SLIDE_MOTION/);
  assert.match(brief, /requestAnimationFrame\(\(\) => setReady\(true\)\)/);
});

test('only the pill paints the active fill', () => {
  /* THE BUG THIS CATCHES: leaving the old `bg-[var(--sel-bg-strong)]` on the selected
   * button paints a second capsule that JUMPS while the real one slides — two fills,
   * one moving and one teleporting, on a control 90px wide. The pill owns the fill now
   * and the buttons own only their text colour. */
  const start = brief.indexOf('export function BriefRange');
  const end = brief.indexOf('function Flag(');
  assert.ok(start > 0 && end > start, 'BriefRange moved — this slice found nothing');
  const range = brief.slice(start, end);
  // Lookbehind excludes `hover:bg-…`; a hover fill is not a selected state, and the
  // Clear button downstream legitimately carries one.
  const fills = range.match(/(?<!:)bg-\[var\(--sel-bg-strong\)\]/g) || [];
  assert.equal(fills.length, 1, 'exactly one element may carry the active fill — the sliding pill');
});

test('the calendar column LADDERS its rows when the listing is replaced', () => {
  /* THIS REPLACES A CROSSFADE OF THE WHOLE COLUMN (owner decision, 2026-09-03). The fade
   * said "this column changed"; the ladder says "these rows are new, and here is how many
   * of them there are", which is the question a trader actually has after tapping Week.
   *
   * ONE KEY STILL COVERS BOTH selected behaviours — the Today/Week switch and the feed
   * landing — because they are the same event: every row in the column is replaced. A
   * separate loading branch would be a second thing to keep in step for no gain. */
  assert.match(brief, /const \[swapped, setSwapped\] = useState\(false\)/);
  assert.match(brief, /<SwappedContext.Provider value=\{swapped\}>/);
  assert.match(brief, /const entrance = useRowEntrance\(index\);/);
  assert.match(dash, /swapKey=\{events == null \? 'loading' : prefs\.window\}/);
});

test('the container is what gets keyed, and the container itself does not animate', () => {
  /* §8b's trap, and it is silent. Today and Week render the SAME row component from a
   * different array, so with rows keyed by event id React reuses the DOM nodes, the CSS
   * animation never re-runs, and the list snaps to new data with no motion and no error.
   * Keying the CONTAINER tears the list down and replays the ladder from i=0.
   *
   * And only the rows move: the card's header, its divider and its scroll position stay
   * anchored, because animating the box would move the frame the rows arrive into. */
  const start = brief.indexOf('export function BriefSection');
  const end = brief.indexOf('export function BriefRange');
  assert.ok(start > 0 && end > start, 'BriefSection moved — this slice found nothing');
  const section = brief.slice(start, end);
  assert.match(section, /key=\{swapKey\}/, 'the scroll box must remount on a new listing');
  assert.ok(!/data-entrance/.test(section), 'the section container must not carry an entrance');
});

test('a row takes its ladder position from an index, never from its key', () => {
  /* THE KEY AND THE DELAY ARE TWO DIFFERENT QUESTIONS. The key says which row this is;
   * the index says when it arrives. Deriving the delay from the key is how a re-keyed
   * list silently stops animating. */
  assert.match(dash, /index=\{i\}/);
  assert.match(brief, /const delay = Math\.min\(index \* ROW_STEP, ROW_SWEEP_CAP\);/);
  assert.match(brief, /const ROW_STEP = 0\.045;/);
});

test('a row enters one duration DOWN from a page section', () => {
  /* §10, amended: an entrance's duration is the size of what moves. That is also what
   * keeps this card's own standing rule intact — brief.jsx must never reach for 400ms,
   * and it does not have to, because a 33px row is not a page section. */
  assert.match(brief, /'data-entrance': 'row'/);
  assert.match(bridgeCss, /\[data-entrance="row"\]\s*\{ animation-name: pv-rise-in; animation-duration: var\(--dur\); \}/);
});

test('the alert exit collapses height via grid rows, with the min-h-0 that makes it work', () => {
  /* CSS cannot transition to `height: auto`, so a row leaving normally needs its height
   * measured in JS. A grid track going 1fr -> 0fr collapses to the content height with
   * no measurement at all.
   *
   * `min-h-0` IS THE WHOLE TRICK AND IS TRIVIAL TO DROP. A grid item floors at its
   * min-content height, and the row inside carries `min-h-[73px]` — without `min-h-0`
   * on the item the track will not go below 73px and the collapse silently does not
   * happen. The row would fade but never shrink, and the list would not close up. */
  assert.equal(briefConst('EXIT_MOTION')[1], 'transition-[grid-template-rows,opacity] duration-[var(--dur)] ease-[var(--ease)]');
  assert.match(brief, /exiting \? 'grid-rows-\[0fr\] opacity-0' : 'grid-rows-\[1fr\] opacity-100'/);
  assert.match(brief, /className="min-h-0 overflow-hidden"/);
});

test('the dismissal timeout equals --dur, so the row unmounts as the collapse ends', () => {
  /* A REAL SEAM, pinned because nothing else can catch it. The exit duration lives in a
   * CSS token; the unmount lives in a setTimeout that cannot read that token without a
   * getComputedStyle call per dismissal. Drift them and the row either unmounts early
   * (a visible clip mid-collapse) or late (a gap that sits open). */
  const tok = tokensCss.match(/--dur:\s*(\d+)ms/);
  assert.ok(tok, 'tokens.css no longer states --dur in ms');
  const timeout = dash.match(/setExiting\([\s\S]*?\}, (\d+)\);/);
  assert.ok(timeout, 'the alert dismissal timeout is gone from Dashboard.jsx');
  assert.equal(timeout[1], tok[1], `dismissal timeout ${timeout[1]}ms must equal --dur ${tok[1]}ms`);
});

test('a dismissed alert cannot re-enter its own exit', () => {
  // §10: once a user has dismissed something it does not animate back. Without the
  // guard a second click restarts the collapse from full height.
  assert.match(dash, /if \(exiting\.has\(id\)\) return;/);
});

test('the sliding pill cannot drive a render loop', () => {
  /* A REAL BUG, CAUGHT BEFORE IT SHIPPED, and it would have hung the dashboard rather
   * than merely looked wrong.
   *
   * DailyBanner re-renders EVERY SECOND — useBriefClock ticks so the header can show
   * seconds. The range options were rebuilt inline on each of those renders, so
   * BriefRange received a new `options` reference every second; its measuring layout
   * effect is keyed on `options`, so it re-ran, set pill state, forced a render, which
   * built a new array, which re-ran the effect. At useLayoutEffect timing that is a
   * synchronous loop that blocks paint.
   *
   * BOTH ENDS ARE PINNED because they guard different things. The memo stops the effect
   * firing at all; the bail-out stops ANY caller — including one written later, on
   * another surface — from reintroducing it. Either alone stops the spin, which is
   * exactly why one alone would let the other rot unnoticed. */
  assert.match(dash, /const RANGE = useMemo\(\(\) => BRIEF_WINDOWS/);
  assert.match(brief, /if \(prev && next && prev\.left === next\.left && prev\.width === next\.width\) return prev;/);
});

test('the brief clock is never animated', () => {
  /* BriefClock reprints the time every second. Animating a figure that changes at that
   * rate is a permanent flicker at the top of the dashboard, and it is the one number
   * on this card a trader reads rather than glances at. */
  const start = brief.indexOf('export function BriefClock');
  const end = brief.indexOf('export const BriefAction');
  assert.ok(start > 0 && end > start, 'BriefClock moved — this slice found nothing');
  const clock = brief.slice(start, end);
  assert.ok(!/transition|animate-|MOTION/.test(clock), 'the clock must not animate');
});

// ---------------------------------------------------------------------------
// THE RELOAD CASCADE — owner decision, 2026-09-03
//
// The page arrives as a cascade of sections and the chrome sweeps in around it, once
// per browser load. What follows pins the four things about that which are invisible
// in a screenshot and easy to break: that the animation is defined somewhere it will
// actually compile, that no FIGURE joins in, that the chrome does not need (and must
// not grow) a JS gate, and that reduced motion is really handled rather than assumed.
// ---------------------------------------------------------------------------

const sidebar = readCode('app/Sidebar.jsx');
const dashSrc = readSrc('features/dashboard/Dashboard.jsx');

test('the entrance keyframes animate transform and opacity, and nothing else', () => {
  /* §10: only transform and opacity animate, never a layout property. A keyframe that
   * moves `top` or `height` repaints the whole page at 60fps, and it is exactly the kind
   * of thing added later by someone reaching for a nicer curve. */
  for (const name of ['pv-rise-in', 'pv-drop-in', 'pv-sweep-in']) {
    const m = bridgeCss.match(new RegExp(`@keyframes ${name}\\s*\\{[^\\n]*`));
    assert.ok(m, `bridge.css no longer defines @keyframes ${name}`);
    const props = m[0].match(/([a-z-]+)\s*:/g) || [];
    const banned = props.filter((p) => !/^(opacity|transform)\s*:$/.test(p));
    assert.deepEqual(banned, [], `${name} animates a layout property`);
  }
});

test('the entrance rules compose from the tokens, and hold at 0 before their delay', () => {
  /* `backwards` IS NOT OPTIONAL, and this is the assertion that says so. Without it every
   * delayed element paints at full opacity for the frames before its delay fires — so the
   * whole cascade flashes into place first and THEN animates, which is worse than no
   * animation at all and reads as a bug in the data rather than in the motion. */
  const base = bridgeCss.match(/\[data-entrance\] \{[\s\S]*?\}/);
  assert.ok(base, 'the [data-entrance] base rule is gone from bridge.css');
  assert.match(base[0], /animation-duration: var\(--dur-slow\)/);
  assert.match(base[0], /animation-timing-function: var\(--ease\)/);
  assert.match(base[0], /animation-fill-mode: backwards/);
});

test('reduced motion zeroes the DELAY as well as the duration', () => {
  /* A REAL BUG, AND THE GLOBAL RESET DOES NOT COVER IT. legacy/app.css collapses
   * `animation-duration` to .001ms and says nothing about `animation-delay` — which
   * leaves a staggered element holding `backwards` at opacity 0 for the whole of its
   * delay and then snapping in. A reduced-motion user would get no animation AND a third
   * of a second of blank chrome: the one outcome worse than the motion itself.
   *
   * Pinned in BOTH directions — the gap in the global reset is asserted too, so that if
   * someone ever fixes it there this fails loudly instead of silently duplicating. */
  const reset = legacyCss.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{[^}]*\}/);
  assert.ok(reset, 'the global reset moved — see the test above');
  assert.ok(!/animation-delay/.test(reset[0]),
    'the global reset now handles delay: fold the bridge.css rules into it rather than keeping both');
  assert.match(bridgeCss, /\[data-entrance\] \{ animation-delay: 0s !important; \}/);
  assert.match(bridgeCss, /\[data-slot="topbar"\] \{ animation-delay: 0s !important; \}/);
});

test('the entrance is a CSS rule, not a utility, because half its callers are pages', () => {
  /* THE FAILURE THIS AVOIDS IS SILENT AND HAS HAPPENED FIVE TIMES (CLAUDE.md §1).
   * Utilities compile only under components/{ui,primitives}; the rail rows are written in
   * app/Sidebar.jsx and the dashboard's sections in features/dashboard, where a utility
   * emits nothing at all and nothing errors.
   *
   * The split is deliberate: the ATTRIBUTE names the animation (a fixed thing, owned in
   * one file) and the caller supplies only the delay as an inline style — which is what
   * "a caller-supplied dimension is a PROP, not a class" means here. */
  for (const src of [sidebar, dashSrc]) {
    assert.ok(!/animate-\[|\bdelay-\[/.test(src),
      'a Tailwind animation utility written in a page compiles to nothing — use data-entrance');
  }
  assert.match(sidebar, /'data-entrance': 'left'/);
  assert.match(entrance, /'data-entrance': 'up'/);
});

// ---- the section cascade ---------------------------------------------------

test('the SKELETON does not cascade — the real content does', () => {
  /* THE FLICKER, PINNED. For one commit the skeleton cascaded on the same indices as the
   * page, on the reasoning that a cold load paints the skeleton first and so the gate
   * would see it. True, and exactly the problem: a cascade holds each section at opacity
   * 0 until its delay, so a staggered SKELETON is a Today's Brief card above half a
   * second of empty page — and then the trades land, tear the placeholder tree down
   * mid-cascade, and the real page arrives on a different motion.
   *
   * A placeholder reserves the SHAPE of what is coming (§15). It does not get the
   * arrival. And because `useSectionEntrance` is what claims the once-per-load flag, not
   * calling it here is also the mechanism that leaves the cascade for the real page. */
  const skelStart = dash.indexOf('export function DashSkeleton');
  const pageStart = dash.indexOf('export default function Dashboard');
  assert.ok(skelStart > 0 && pageStart > skelStart, 'the two components moved');
  const skeleton = dash.slice(skelStart, pageStart);
  assert.ok(!/useSectionEntrance|data-entrance/.test(skeleton),
    'the skeleton must not animate — it is about to be replaced');
  const idx = (s) => (s.match(/section\((\d)\)/g) || []).map((m) => m.slice(8, 9));
  assert.deepEqual(idx(dash.slice(pageStart)), ['0', '1', '2', '3', '4', '4'],
    'the page cascade changed');
  assert.equal(dash.match(/const section = useSectionEntrance\(\);/g).length, 1,
    'exactly one branch may claim the arrival');
});

test('the calendar and the right column share an index, so they arrive as one unit', () => {
  /* The design draws them as a single block, and the spec this came from animates the
   * grid WRAPPER for exactly that reason. We cannot: they are children of
   * `dash-main-grid`, and a wrapper div would break the grid — which §2 forbids for
   * visual work. The same delay is the same reading with no structural change. */
  assert.match(dash, /<div className="dash-cal-cell" \{\.\.\.section\(4\)\}>/);
  assert.match(dash, /<div className="dash-side" \{\.\.\.section\(4\)\}>/);
  assert.match(dashSrc, /`section\(4\)` TWICE IS DELIBERATE/, 'the reasoning must stay at the call site');
});

test('sections arrive as whole blocks — no figure animates', () => {
  /* THE HALF OF THE PROTOTYPE THAT WAS DECLINED (owner decision, 2026-09-03). It ladders
   * ~35 calendar day cells and the trade rows, and draws the P&L line over 1.1s. A figure
   * animating toward its place is unreadable for exactly as long as the animation runs,
   * and that line would have been the SLOWEST thing on a page a trader opened to read
   * three numbers.
   *
   * Recharts is pinned too: its own entrance is on by default and re-runs on every data
   * change, which is the same rule broken by a library instead of by us. */
  for (const f of ['components/primitives/calendar.jsx', 'features/calendar/MonthCalendar.jsx']) {
    assert.ok(!/data-entrance|animate-\[/.test(readCode(f)), `${f} must not animate its cells`);
  }
  assert.match(dash, /isAnimationActive=\{false\}/, 'the chart must not animate its own line');
});

// ---- the chrome ------------------------------------------------------------

test('the chrome needs no JS gate, because it mounts once per document', () => {
  /* <Layout> is a PATHLESS LAYOUT ROUTE, so the rail and the top bar mount once and
   * persist across every client-side navigation — a CSS animation fires once per element,
   * which makes "once per browser load" fall out of the DOM for free. Only the routed
   * page needs the module flag, because only the routed page remounts.
   *
   * A gate here would not be harmless: it would make the chrome depend on a context it
   * does not need, and quietly stop animating if that provider ever moved. */
  assert.match(bridgeCss, /\[data-slot="sidebar-inner"\] \{ animation: pv-sweep-in var\(--dur-slow\) var\(--ease\) backwards; \}/);
  assert.match(bridgeCss, /\[data-slot="topbar"\]\s+\{ animation: pv-drop-in\s+var\(--dur-slow\) var\(--ease\) backwards; \}/);
});

test('the mobile drawer is excluded from the sweep, at both ends', () => {
  /* IT WOULD OTHERWISE REPLAY ON EVERY TAP. Under 900px the rail is a Sheet that mounts
   * and unmounts on each open, and the Sheet already slides in — a second animation on
   * top of it is the same statement made twice.
   *
   * The SHELL is excluded by selector: the generated Sidebar renders `sidebar-inner` on
   * desktop only, and the mobile branch's inner div carries no data-slot at all. The ROWS
   * are excluded in JS, because they render in both. */
  assert.match(sidebar, /const entering = !isMobile;/);
  assert.ok(!/data-mobile/.test(bridgeCss), 'the shell rule relies on sidebar-inner being desktop-only');
});

test('the rail ladders at half the page step, and the footer closes the sweep', () => {
  /* 30ms AGAINST THE PAGE'S 60ms, and the reason is what is being counted: nine rows of
   * one list here, six different cards there. At the same step the rail would still be
   * assembling after the page beside it had finished.
   *
   * FOOT_DELAY IS DERIVED FROM NAV.length, not written down. A hardcoded 0.34 silently
   * starts overlapping the last nav rows the day a module is added. */
  assert.match(sidebar, /const NAV_STEP = 0\.03;/);
  assert.match(sidebar, /const NAV_BASE = 0\.06;/);
  assert.match(sidebar, /const FOOT_DELAY = NAV_BASE \+ NAV\.length \* NAV_STEP;/);
  assert.match(sidebar, /entrance=\{sweep\(NAV_BASE \+ i \* NAV_STEP, entering\)\}/);
});

test('the section step lives in JS, deliberately, and is not a fake token', () => {
  /* No CSS rule reads it — a delay is computed per index and handed over inline. A token
   * nothing resolves would be decoration in the one file whose whole job is to be the
   * single source of values. Asserted so nobody tidies it into tokens.css and leaves two
   * places to change. */
  assert.match(entrance, /export const SECTION_STEP = 0\.06;/);
  assert.ok(!/--stagger|--section-step/.test(tokensCss), 'the stagger must not become a token nothing reads');
});

test('§10 carries the cascade amendment rather than still forbidding it', () => {
  /* §21: amending a LOCKED section needs the rule, the reason, the place the value lives
   * and a test, committed together. This is the fourth, and it guards a document that
   * until this commit said the opposite in two places — that the page fades as one flat
   * block, and that 400ms is "never for a surface appearing". */
  const dls = readFileSync(new URL('../docs/design/DESIGN-LANGUAGE.md', import.meta.url), 'utf8');
  const s10 = dls.slice(dls.indexOf('## §10 Motion'), dls.indexOf('## §11'));
  assert.ok(s10.length > 0, '§10 moved — this slice found nothing');
  assert.match(s10, /THE APP ARRIVES ONCE PER BROWSER LOAD, AS A CASCADE/);
  assert.match(s10, /AN ENTRANCE TRAVELS, AND ITS DURATION IS THE SIZE OF WHAT MOVES/);
  assert.match(s10, /Sections arrive as WHOLE BLOCKS\. No figure animates/);
  assert.match(s10, /EVERY RE-ENTRANCE NEEDS A REMOUNT/);
  assert.match(s10, /THE STAGGER RHYTHM: 60ms between page sections, 30ms between rail rows/);
  // The reduced-motion delay gap is a RULE now, not just a line of CSS someone can drop.
  assert.match(s10, /MUST ZERO ITS DELAY UNDER `prefers-reduced-motion`/);
});

// ---------------------------------------------------------------------------
// LOADING SKELETONS — the second looping animation, added 2026-09-03
// ---------------------------------------------------------------------------

test('the skeleton breathes, because a motionless grey box reads as an empty page', () => {
  /* THE BUG THIS FIXES WAS REPORTED AS "the dashboard looks blank on reload", and it was
   * literal: SkeletonBlock painted a flat --surface-2 rectangle and nothing else. Legacy
   * CSS's `.u-skeleton` has always had a shimmer; these primitives never used it, so the
   * one screen with the most placeholders was the one with no sign of life on it.
   *
   * OPACITY, NOT A SWEEPING HIGHLIGHT. The legacy shimmer needs `position: relative`,
   * `overflow: hidden` and a pseudo-element on every box — three properties that collide
   * with the dimensions these primitives take as PROPS. */
  assert.match(bridgeCss, /@keyframes pv-breathe-soft \{ 0%, 100% \{ opacity: 1; \} 50% \{ opacity: \.45; \} \}/);
  assert.match(bridgeCss, /\[data-slot="skeleton-block"\],\s*\n\[data-slot="skeleton-line"\] \{\s*\n\s*animation: pv-breathe-soft 2s cubic-bezier\(\.4, 0, \.6, 1\) infinite;/);
});

test('the loading pulse is slower than every settling duration in the app', () => {
  /* A HEARTBEAT, NOT AN EVENT. §10's durations are for things that resolve; this one
   * describes a condition that has not. At --dur-slow nineteen boxes pulsing together is
   * a strobe, and it would also read as the app doing something rather than waiting. */
  const slow = Number(tokensCss.match(/--dur-slow:\s*(\d+)ms/)[1]);
  const pulse = Number(bridgeCss.match(/animation: pv-breathe-soft (\d+)s/)[1]) * 1000;
  assert.ok(pulse > slow * 4, `the skeleton pulse (${pulse}ms) must be far slower than --dur-slow (${slow}ms)`);
});

test('§10 no longer claims the banner is the only looping animation', () => {
  /* IT SAID SO UNTIL THIS COMMIT, and a locked document that contradicts the CSS it
   * governs is how a design system quietly stops being one. The rule is not a COUNT — it
   * is that a loop is legal only while its condition has not settled. Both loops in the
   * app stop on their own when the state they describe resolves. */
  const dls = readFileSync(new URL('../docs/design/DESIGN-LANGUAGE.md', import.meta.url), 'utf8');
  const s10 = dls.slice(dls.indexOf('## §10 Motion'), dls.indexOf('## §11'));
  assert.match(s10, /A LOOP IS ONLY LEGAL WHILE ITS CONDITION HAS NOT/);
  assert.match(s10, /\*\*Loading skeletons breathe\*\*/);
  assert.ok(!/it is the only looping animation in the app/.test(s10),
    '§10 still claims the banner is the only loop');
});

test('a reduced-motion user keeps the skeleton, its label and its note — only the pulse goes', () => {
  /* §10: the state change still happens. The pulse is the one part of "this is loading"
   * that is purely motion; `aria-busy`, the region label and the "Loading…" note all carry
   * the same information without it, and the global reset collapses the animation. */
  const panel = readCode('components/primitives/panel.jsx');
  assert.match(panel, /aria-busy="true"/);
  assert.match(panel, /export function LoadingNote/);
  assert.ok(!/motion-safe:/.test(bridgeCss.slice(bridgeCss.indexOf('pv-breathe-soft'))),
    'the skeleton pulse leans on the global reset, like every other animation here');
});

test('the column asks for a scrollbar only when it MEASURABLY overflows', () => {
  /* TWO BUGS AT ONE BOUNDARY, and both come from the box being drawn to hold
   * four-and-a-bit rows at 153px while four rows come to exactly 153 (4x33 + 3x7).
   *
   *   1. A row entering from `translateY(8px)` contributes its TRANSFORMED box to the
   *      scrollable overflow, so mid-ladder the content is 8px taller than the box. The
   *      scrollbar appeared, rode the animation and vanished, on every Today/Week toggle.
   *   2. At rest, sub-pixel rounding tips 153 over 153 and draws a thumb that fills its
   *      whole track and cannot move — which scrollbars.css itself calls "worse than no
   *      thumb at all" in the comment above its `min-height`.
   *
   * The `+ 1` is what absorbs the rounding, and measuring after the animations settle is
   * what stops the transform being counted. */
  assert.match(brief, /setScrollable\(box\.scrollHeight > box\.clientHeight \+ 1\)/);
  assert.match(brief, /data-scroll=\{scroll && scrollable \? 'y' : undefined\}/);
});

test('the switch is the ATTRIBUTE, because an unlayered rule owns the property', () => {
  /* THE FIRST ATTEMPT WAS COMPLETELY INERT AND NOTHING SAID SO. It toggled a Tailwind
   * `overflow-hidden` on the box — but scrollbars.css sets `overflow-y: auto` on
   * `[data-scroll='y']` from an UNLAYERED file, and unlayered beats `layer(utilities)`
   * at any specificity. The class was in the DOM, the rule never applied, and the
   * scrollbar behaved exactly as before.
   *
   * That precedence is deliberate elsewhere — it is the whole reason tokens.css wins — so
   * the lesson is not "avoid unlayered", it is that a property has ONE owner and the only
   * honest switch is the hook that owner selects on. */
  const css = readSrc('styles/scrollbars.css');
  assert.match(css, /\[data-scroll='y'\] \{[^}]*overflow-y: auto;/,
    'scrollbars.css owns overflow-y — a utility cannot take it back');
  assert.ok(!/entering \? 'overflow-hidden'/.test(brief),
    'toggling a layered utility against an unlayered rule does nothing');
  assert.match(brief, /scroll && 'max-h-\[153px\] overflow-hidden max-\[1200px\]:max-h-none'/,
    'the resting state must CLIP, so a list with no bar cannot spill out of the card');
});

test('the measurement waits on the animations themselves, never on a duplicated timeout', () => {
  /* THE SWEEP'S LENGTH IS A DELAY PLUS A CSS TOKEN — 45ms x index, capped, plus `--dur`.
   * Re-deriving that sum in JS would make a third place to keep one number in step, and
   * this file already carries a comment about the one seam of that kind it could not
   * avoid (the alert dismissal timeout). `Animation.finished` is the browser reporting
   * the real end, so it cannot drift when the step or the token changes.
   *
   * INFINITE ANIMATIONS ARE FILTERED OUT or the measurement would never run — a skeleton
   * pulse inside a swapped section would defer it for ever. Nothing does that today; the
   * guard is here because that failure would be silent and permanent. */
  assert.match(brief, /a\.playState !== 'finished' && a\.effect\?\.getTiming\?\.\(\)\.iterations !== Infinity/);
  assert.match(brief, /Promise\.allSettled\(pending\.map\(\(a\) => a\.finished\)\)/);
  assert.ok(!/setTimeout/.test(brief), 'the measurement must not reimplement the sweep length');
});

test('the ResizeObserver measures through the guard, not around it', () => {
  /* A REAL BUG THAT SURVIVED THE FIRST FIX, and the shape of it is worth remembering: the
   * guard was on the manual call, and `measure` was handed straight to the observer —
   * which FIRES ONCE THE MOMENT YOU OBSERVE. That initial callback landed mid-ladder, read
   * content 8px taller than the box, and switched the scrollbar on for the length of the
   * animation. The safety net routed around the safety check.
   *
   * So the observer must receive the guarded function, never the raw read. */
  assert.match(brief, /new ResizeObserver\(measure\)/);
  assert.match(brief, /const apply = \(\) => \{ if \(live\) setScrollable/);
  assert.match(brief, /const measure = \(\) => \{\s+const pending = running\(\);/,
    'measure() itself must check for running animations');
});

test('the measurement re-runs when the CONTENT changes, not only the box', () => {
  /* A ResizeObserver watches the BOX. An alert dismissed or a feed landing changes what is
   * inside it while the box stays capped at 153px, so neither would ever fire one.
   *
   * Counting children is what makes the dependency cheap. The alternative — no dependency
   * array — works, but this card re-renders every second because the clock ticks, so it
   * would rebuild the observer sixty times a minute to learn nothing. */
  assert.match(brief, /\}, \[scroll, swapKey, React\.Children\.count\(children\)\]\);/);
});
