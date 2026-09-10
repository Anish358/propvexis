import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legacyCss } from './helpers/app-css.js';

/* TABS — Cycle 00, piece 7.
 *
 * IT EXISTS BECAUSE THE OWNER ASKED WHY TABS WERE NOT IN ANY PIECE (2026-09-10). They
 * were in the brief, at §4.5, whose first line reads "The conversion is already done…
 * Nothing to design here." That sentence was TRUE — and it is exactly why this never
 * became a numbered piece: the item read as finished, so it was never scheduled, and the
 * DECISION it still owed went with it.
 *
 * THIRD TIME IN THIS CYCLE an audit note filed something under "nothing to do" and hid
 * real work: `ui/tooltip.jsx` (installed, never wrapped), `ui/sheet.jsx` (same), and
 * this. Worth naming, because it will happen again: **"already done" is a claim about
 * the CONVERSION, never about the DECISION.**
 *
 * THE RULING (owner, 2026-09-10): one tab style, two skins. `PanelTabs` is rebuilt as a
 * composition of the shipped trigger; the Dashboard's account selector turned out NOT
 * to be on legacy CSS at all — see the last two tests.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(at(p), 'utf8');

const tabs = read('../frontend/src/components/primitives/tabs.jsx');
const panel = read('../frontend/src/components/primitives/panel.jsx');
const generated = read('../frontend/src/components/ui/tabs.jsx');
const barrel = read('../frontend/src/components/primitives/index.js');
const dashboard = read('../frontend/src/features/dashboard/Dashboard.jsx');
const account = read('../frontend/src/components/primitives/account.jsx');
const kit = read('../frontend/src/features/dev/KitTabs.jsx');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const panelCode = strip(panel);

test('the parts are exported — INCLUDING the root, or composition is impossible', () => {
  /* THE ARRAY API IS THE DISEASE. `Tabs` exposes only `tabs={[{value,label}]}`, so a
   * caller cannot reach an individual trigger — and anything wanting a different weight,
   * padding or underline is PHYSICALLY UNABLE to use the component and has to hand-build
   * one. That is how this app grew three tab implementations. The array stays for the
   * nine screens that like it; the parts come with it.
   *
   * ⚠ THE ROOT IS THE ONE THAT WAS NEARLY MISSED, and without it the whole piece is a
   * no-op: a list and a trigger with no root compose into nothing, because Base UI's
   * parts read their state from it. `PanelTabs` did not catch it — it lives in
   * `components/primitives` and can import the generated root directly. A PAGE cannot.
   * The /test specimen found it, one line after the export was written. */
  for (const name of ['TabsRoot', 'TabsList', 'TabsTrigger', 'TabsContent']) {
    assert.ok(
      new RegExp(`\\b${name}\\b`).test(barrel),
      `${name} is not exported from the barrel. Without all four a page cannot compose a `
        + 'tab strip, and the next richer strip gets hand-built — which is the exact '
        + 'fault piece 7 exists to remove.',
    );
  }
  assert.match(
    tabs, /UITabs as TabsRoot/,
    'the ROOT is no longer exported. A list and a trigger without it render nothing '
      + 'useful; this is the part that makes the other three mean anything.',
  );
});

test('the array form survives, because nine screens use it', () => {
  /* The fix is ADDITIVE. Removing the array to force composition everywhere would churn
   * nine call sites to gain nothing — the short form is right when all a caller has is
   * a value and a label. */
  assert.match(tabs, /function Tabs\(\{ tabs = \[\]/, 'the array form has gone');
});

test('PanelTabs is a COMPOSITION of the shipped trigger, not a copy of its rules', () => {
  /* THE RULING, ASSERTED. It used to be a hand-written `<div role="tablist">` of
   * hand-written `<button role="tab">`s. Both of the reasons it gave are closed: the
   * "this is the panel's own edge" one EXPIRED on 09-08 when Tabs left legacy CSS (the
   * ninth expired reason of the review), and the array-API one was fixed above. */
  assert.match(
    panelCode, /from '@\/components\/ui\/tabs'/,
    'PanelTabs is hand-built again. The four things that distinguish it — 16px semibold, '
      + 'the --action-2 line, measured padding, and where the underline sits — are all '
      + 'CLASSES ON A SHIPPED TRIGGER, which is what the ruling settled.',
  );
  assert.match(panelCode, /<TabsTrigger/, 'PanelTab no longer renders the shipped trigger');
  assert.doesNotMatch(
    panelCode, /role="tablist"|role="tab"/,
    'PanelTabs is hand-declaring tab roles again. Base UI sets them — and it also does '
      + 'the arrow-key navigation and roving tabindex that the hand-written version '
      + 'claimed with those roles and never implemented.',
  );
});

test('⚠ the 2px arithmetic — border-b-2 occupied space and `after:` does not', () => {
  /* THE THING THAT WOULD HAVE SILENTLY SHORTENED THE LOCKED DASHBOARD.
   *
   * The old underline was a real border: 15 top + 18 line-height + 13 bottom + 2 border
   * = 48px. The registry draws its line with an ABSOLUTELY POSITIONED `after:`, which
   * occupies no height at all — so a naive composition loses two pixels, on a page that
   * is signed off, with nothing in the diff to show it.
   *
   * The bottom padding is 15px rather than 13 to put them back. This test is the only
   * place that arithmetic is checkable. */
  assert.match(generated, /after:absolute/, 'the registry no longer draws its line with after:');
  assert.match(
    panelCode, /pt-\[15px\] pb-\[15px\]/,
    'the panel tab\'s padding changed. It is 15/15 — not the original 15/13 — precisely '
      + 'because the 2px `border-b-2` used to occupy is now an absolutely positioned '
      + '`after:` that occupies nothing. 15/13 here means the strip is 46px and the '
      + 'Dashboard moved.',
  );
  assert.doesNotMatch(
    panelCode, /border-b-2/,
    'the panel tab is drawing its own border again, which will double with the '
      + 'registry\'s `after:` line.',
  );
});

test('the panel underline is OURS, and sits on the button rather than below it', () => {
  /* Two overrides, both because the registry positions its line for a list that sits
   * above a rail (`bottom-[-5px]`), and ours IS the edge. */
  assert.match(generated, /after:bottom-\[-5px\]/, 'the registry moved its underline');
  assert.match(
    panelCode, /after:bottom-0/,
    'the panel underline is back at the registry\'s -5px, which puts it below the card '
      + 'edge it is supposed to BE.',
  );
  assert.match(
    panelCode, /after:bg-\[var\(--action-2\)\]/,
    'the panel underline lost the brand colour. The registry uses `bg-foreground`; this '
      + 'strip has always used --action-2 and that is one of the two skins.',
  );
});

test('the Dashboard call site moved to the value API, and only the API moved', () => {
  /* Base UI needs the strip to own the value in order to do the keyboard work, so
   * `selected` + `onClick` became `value`. Dashboard.jsx is the ONLY caller — a fact
   * worth re-checking, because it is what made this safe to do at all. */
  assert.match(
    dashboard, /<PanelTabs value=\{tab\} onValueChange=\{setTab\}>/,
    'the Dashboard is not driving PanelTabs by value. Without it Base UI has no state '
      + 'and the tabs do not switch.',
  );
  assert.doesNotMatch(
    strip(dashboard), /<PanelTab selected=/,
    'the old `selected` API is back at the call site.',
  );
});

test('both registry variants are on the Test page, because the app will use both', () => {
  /* OWNER, 2026-09-10: "we will not only be using the current line style tabs
   * everywhere, we will also use different styles."
   *
   * `tabsListVariants` ships exactly TWO and the app had only ever used one. The
   * segmented `default` -- a filled trough with a raised pill inside it -- has never
   * appeared in this product, which is exactly how the next unit switch would have been
   * hand-built as a row of buttons: nobody knew it was there. Both are on /test now, and
   * this keeps them there, because an unused variant is one nobody remembers.
   *
   * The distinction the page proposes, and the one worth ruling on: TABS SWITCH A VIEW,
   * A TOGGLE GROUP SETS A VALUE. `ToggleGroup` is also approved and overlaps. */
  assert.match(
    generated, /line: "gap-1 bg-transparent"/,
    'the registry renamed or dropped its `line` variant',
  );
  assert.match(
    generated, /default: "bg-muted"/,
    'the registry dropped the segmented `default` variant, which the styles gallery '
      + 'presents as one of the app\'s two options.',
  );
  assert.match(kit, /variant="line"/, 'the styles gallery lost the line variant');
  assert.match(
    kit, /<TabsTrigger value="r">R<\/TabsTrigger>/,
    'the styles gallery lost the SEGMENTED specimen -- a bare <TabsList> with no '
      + 'variant, which is how the registry default is reached. Without it on the page '
      + 'the variant stays invisible and the next unit switch gets hand-built.',
  );
});

test('the account selector\'s tab rules are GONE, and the dot is not a tab', () => {
  /* THE BRIEF SAID THIS SCREEN WAS "still on legacy CSS". IT WAS NOT — a stale note, and
   * the fourth of this cycle. The selector had already moved to `AccountTab` in
   * `primitives/account.jsx`; only the rules were left behind, rendering nothing.
   *
   * Four dead rules deleted 2026-09-10 with their fixture name (and `is-active`, whose
   * only declaration was the selected state of this tab). legacy/app.css: 968 -> 966. */
  assert.doesNotMatch(
    legacyCss, /\.dash-acct-tab\s*\{/,
    'the dead account-tab rules are back. They rendered nothing for weeks — the selector '
      + 'is AccountTab in account.jsx.',
  );

  /* ⚠ THE DOT IS LIVE AND IS NOT A TAB, which is why only four of the five names went.
   * `.dash-acct-tab-dot` is an 8px status dot used by AccountWorkspace and
   * ChallengeDetails in PROP OS. It keeps a tab's name because the tab is where it
   * started; renaming it belongs to Prop OS's cycle, and deleting it here would have
   * unstyled two live screens. */
  assert.match(
    legacyCss, /\.dash-acct-tab-dot\s*\{/,
    'the status dot was deleted with the tab rules. It is still rendered by '
      + 'AccountWorkspace and ChallengeDetails — deleting it unstyles both.',
  );
});

test('the live account selector is a CHIP, and deliberately not a tab strip', () => {
  /* WHAT THE OWNER ASKED FOR AND WHY IT IS NOT WHAT HAPPENED. "Replace the legacy one
   * with registry for the account selector" assumed a legacy tab strip. There is no
   * legacy tab strip; there is `AccountTab`, and it is a different OBJECT — a bordered
   * card carrying a health RING (two facts: the outer ring is selection, the inner dot
   * is health), a name, a phase and an optional alert glyph. It is `aria-pressed`, not
   * `role="tab"`.
   *
   * Composing it on a TabsTrigger would not be a skin change; it would be deciding that
   * a row of account cards IS a tablist, on the locked dashboard, for a component far
   * richer than PanelTab. That is a question, not a refactor — it is on /test. */
  assert.match(
    account, /aria-pressed=\{selected\}/,
    'AccountTab changed its selection semantics. If it became a real tab, that was a '
      + 'decision about the locked dashboard and this test should carry it.',
  );
});

/* ── THE REGISTRY'S QUALIFIED CLASSES (2026-09-11) ────────────────────────────────────
 *
 * WHAT WENT WRONG, ON THE LOCKED DASHBOARD, WITH NOTHING IN THE DIFF TO SHOW IT.
 * The composition above overrode three registry classes by restating them — `h-auto`
 * against the list's `h-8`, `h-auto`… no: nothing at all against the trigger's
 * `h-[calc(100%-1px)]`, and `after:bottom-0` against `after:bottom-[-5px]`. Every one
 * of those registry classes carries a `group-data-*` modifier or, in the trigger's case,
 * had no override written for it at all — and TAILWIND-MERGE ONLY DROPS A CLASS WHOSE
 * MODIFIER SET MATCHES. So all three survived the merge and both rules applied — and the
 * registry's won, NOT on specificity: Tailwind wraps the group condition in `:where()`,
 * which contributes nothing, so the pair is dead equal at (0,1,0) and SOURCE ORDER
 * decides. Qualified utilities are emitted after plain ones (`.h-auto` at byte 134509 of
 * the built sheet, `group-data-horizontal/tabs:h-8` at 189101), so the registry is simply
 * last. Worth knowing precisely, because it means writing our override later in the
 * className does nothing — only matching the qualifier, so twMerge deletes theirs, does.
 *
 * The result: the strip rendered at the registry's 32px + 1px hairline = 33, not 49, with
 * the 48px trigger spilling out of it; every row of Recent trades moved UP 16px, and the
 * active underline sat 5px below a button that was itself hanging out of its list.
 *
 * THIRD TIME THIS EXACT TRAP HAS COST REAL TIME — see the top bar's pill hover, which
 * lost its background the same way. The rule it settles: WHERE THE REGISTRY QUALIFIES A
 * CLASS, OUR OVERRIDE WEARS THE SAME QUALIFIER. These tests run the real merge rather
 * than reading for the presence of our class, because presence is exactly what was true
 * while the bug was live. */

const cnMod = await import('../frontend/src/lib/utils.js');
const { cn } = cnMod;

/* Both sides of each merge, read out of the two files rather than restated here — a
 * restated registry string is a test that passes through a re-install that changed it. */
const chunk = (src, start, ...stops) => {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `cannot find ${start} — the component was renamed or restructured`);
  const ends = stops.map((s) => src.indexOf(s, i + start.length)).filter((n) => n > 0);
  return src.slice(i, ends.length ? Math.min(...ends) : src.length);
};
const classesIn = (block) => (block.match(/'[^']*'|"[^"]*"/g) || [])
  .map((s) => s.slice(1, -1))
  .filter((s) => /(^|\s)(group|relative|inline|after:|data-|[a-z]+-)/.test(s))
  .join(' ');

const mergedList = cn(
  classesIn(chunk(generated, 'const tabsListVariants', 'function TabsTrigger')),
  classesIn(chunk(panelCode, 'export function PanelTabs', '\nexport function')),
).split(/\s+/);
const mergedTab = cn(
  classesIn(chunk(strip(generated), 'function TabsTrigger', '\nfunction TabsContent')),
  classesIn(chunk(panelCode, 'export function PanelTab(', '\nexport function')),
).split(/\s+/);

/* What actually applies when the strip is horizontal: an unmodified class, or one
 * qualified by the horizontal orientation, and nothing else. ANCHORED — an unanchored
 * `h-` also matches the underline's own `after:h-0.5` thickness, which is a different
 * property on a different box. */
const horizontal = (list, util) => list.filter(
  (c) => new RegExp(`^(group-data-horizontal/tabs:)?${util}`).test(c),
);

test('⚠ the tab strip is 48px because the LIST is auto-height, and the merge must prove it', () => {
  /* The registry sizes its list at `h-8` for a 32px pill strip. Ours is the panel's own
   * top edge at 48, and the height comes from the trigger's padding — so the list must
   * carry no height of its own at all. */
  assert.match(
    generated, /group-data-horizontal\/tabs:h-8/,
    'the registry stopped qualifying its list height. Re-derive this test — if it is now '
      + 'a bare `h-8`, a bare `h-auto` displaces it and the override can be simplified.',
  );
  assert.deepEqual(
    horizontal(mergedList, 'h-'), ['group-data-horizontal/tabs:h-auto'],
    'the registry\'s `h-8` survived the merge beside our override, which means the list '
      + 'is 32px and the whole strip is 33 instead of 49. Our height override must wear '
      + 'the same `group-data-horizontal/tabs:` qualifier the registry uses.',
  );
  assert.deepEqual(
    horizontal(mergedTab, 'h-'), ['h-auto'],
    'the trigger is not auto-height. The registry ships `h-[calc(100%-1px)]`, written for '
      + 'a trigger inside a fixed 32px list; here the height IS the padding, so a '
      + 'percentage of the parent leaves the content spilling out of the button.',
  );
});

test('⚠ the active underline sits on the button edge — qualified, or it loses', () => {
  assert.match(
    generated, /group-data-horizontal\/tabs:after:bottom-\[-5px\]/,
    'the registry moved or unqualified its underline offset — re-derive this test.',
  );
  assert.deepEqual(
    horizontal(mergedTab, 'after:bottom-'), ['group-data-horizontal/tabs:after:bottom-0'],
    'the registry\'s `after:bottom-[-5px]` survived the merge, so the underline draws 5px '
      + 'BELOW the button — below the card hairline it is supposed to BE. Ours has to '
      + 'carry the same qualifier.',
  );
});

test('the 49px this strip is measured at is derived, not restated', () => {
  /* recent-trades-fit.test.js fits six rows into a 374px card on TABS = 49, and that 49
   * is a constant sitting beside the component rather than read out of it — which is why
   * the strip could render at 33 with every test green. This is the derivation: the
   * trigger's own padding and line-height, plus the list's hairline. */
  const tab = chunk(panelCode, 'export function PanelTab(', '\nexport function');
  const pt = Number(/pt-\[(\d+)px\]/.exec(tab)?.[1]);
  const pb = Number(/pb-\[(\d+)px\]/.exec(tab)?.[1]);
  const lead = Number(/leading-\[(\d+)px\]/.exec(tab)?.[1]);
  assert.ok(pt && pb && lead, 'the tab\'s padding or line-height is no longer readable here');

  const list = chunk(panelCode, 'export function PanelTabs', '\nexport function');
  assert.match(list, /border-b border-\[var\(--line-inset\)\]/, 'the strip lost its hairline');
  const stripH = pt + lead + pb + 1;

  const fitTest = read('./recent-trades-fit.test.js');
  const pinned = Number(/const TABS = (\d+)/.exec(fitTest)?.[1]);
  assert.equal(
    stripH, pinned,
    `the strip now derives to ${stripH}px but recent-trades-fit.test.js fits the card `
      + `against ${pinned}. Six rows and the footer are budgeted off that number — move `
      + 'both together, or the dashboard card silently loses a row.',
  );
});
