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
