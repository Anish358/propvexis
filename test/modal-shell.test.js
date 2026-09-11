import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss, tokensCss } from './helpers/app-css.js';
import { readSrc } from './helpers/src-files.js';

// Phase 4b — the shared Modal shell, and every dialog in the app adopting it.
//
// Like the top bar's overlays, this migration is mostly invisible to a test suite: the
// content of each modal is byte-identical, the CSS classes are identical, and the
// existing per-modal assertions kept passing throughout. What changed is Escape, focus
// containment, focus return, aria-modal, scroll locking and portalling. So those are
// what this file pins — plus the two things the migration could silently get wrong,
// which are the parts worth reading:
//
//   1. CENTRING BY CONTAINMENT. `.modal` is unlayered legacy CSS and therefore beats
//      every Tailwind utility, including `fixed`. shadcn's generated Dialog centres a
//      *sibling* popup with `fixed top-1/2 left-1/2 -translate-1/2`; that cannot work
//      here, because `.modal { position: relative }` wins. If the popup is ever moved
//      out of the backdrop, every modal in the app renders unpositioned in normal flow
//      at the end of <body>, underneath a scrim with `z-index: 2147483000`. It would
//      not look like a layout bug. It would look like the modals stopped opening.
//
//   2. OUTSIDE-CLICK DISMISSAL DEPENDS ON THAT SAME NESTING. Base UI closes a modal on
//      outside press only when the press target IS the registered backdrop element
//      (`useDialogRoot`'s `outsidePress`). Wrap the popup in any neutral div and clicks
//      land on the wrapper instead, silently removing the click-outside-to-close that
//      all thirteen dialogs had before this migration.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
// Resolved by name, not by location: which feature folder a dialog lives in is not
// what this file is asserting, and the DIALOGS list below names thirteen of them.
const src = (f) => readSrc(f);

const shell = src('components/primitives/modal.jsx');
const dialog = src('components/primitives/dialog.jsx');
const barrel = src('components/primitives/index.js');
const css = appCss;
const bridge = readSrc('styles/bridge.css');
const bridgeSpacing = bridge;

// Strip comments before asserting on code. These files explain at length WHY the
// hand-rolled backdrops, portals and stopPropagation calls are gone, so a naive grep
// finds them in the prose and reports the very thing that was removed as still present.
const code = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX block comments
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// Every dialog in the app, and the surface each one renders on. Thirteen, not the
// eleven the original audit counted: SetTargetModal is declared inline inside
// Dashboard.jsx, and the (now removed) layout editor used `.dle-*` classes, so neither turned up in a
// grep for `*Modal.jsx` or `.modal-backdrop`.
const DIALOGS = [
  // Was `AccountsModal.jsx`. The manage-everything modal split into AccountEditModal
  // + EaSetupModal when its account LIST became Settings > Accounts; both live in this
  // file, so the count is unchanged and so is every assertion below. (It was
  // AccountFormModal, add-or-edit, until adding became the /accounts/new wizard.)
  ['AccountForms.jsx', 'modal'],
  ['AddTradeModal.jsx', 'modal'],
  ['DayJournalWorkspace.jsx', 'modal'],
  ['DayTradesModal.jsx', 'modal'],
  ['FeesModal.jsx', 'modal'],
  ['ImportTradesModal.jsx', 'modal'],
  ['PayoutsModal.jsx', 'modal'],
  ['StrategyRulesModal.jsx', 'modal'],
  ['SyncModal.jsx', 'modal'],
  ['TagModal.jsx', 'modal'],
  ['TradeSettingsModal.jsx', 'modal'],
  ['Dashboard.jsx', 'modal'],          // SetTargetModal, inline
  ['ReplayModal.jsx', 'rp-modal'],     // its own 960x640 chart frame
  // DashLayoutEditor.jsx was here with its own `.dle-panel` surface. It went with the
  // customize-layout feature (2026-08-30); ReplayModal is now the only dialog that
  // keeps a surface of its own.
];

test('every dialog is on the shared shell', () => {
  for (const [file] of DIALOGS) {
    const s = code(src(file));
    assert.match(s, /from '@\/components\/primitives'/, `${file} must import the primitives`);
    assert.match(s, /<Modal\b/, `${file} must render the shared Modal shell`);
  }
});

test('not one dialog still hand-rolls a backdrop, a portal or a click-eating wrapper', () => {
  // This is the whole point of the shell: one accessible implementation instead of
  // thirteen approximations. Any file that keeps its own is not migrated, it is
  // duplicated — and the duplicate is the one that will drift.
  for (const [file] of DIALOGS) {
    const s = code(src(file));
    assert.ok(!/className="modal-backdrop"/.test(s), `${file} still renders its own backdrop`);
    assert.ok(!/className="(rp|dle|tp)-backdrop"/.test(s), `${file} still renders its own backdrop`);
    assert.ok(!/createPortal/.test(s), `${file} still portals by hand — the shell does that`);
    assert.ok(!/stopPropagation\(\)\}\s*role="dialog"/.test(s), `${file} still hand-rolls its dialog`);
  }
});

test('the hand-written role="dialog" attributes are gone, because the primitive owns them', () => {
  // Only two of the thirteen ever declared it, and neither implemented aria-modal, a
  // focus trap or focus return. As with the top bar's role="menu", an ARIA contract
  // that lies is worse than an absent one: a screen reader announces a dialog and then
  // Tab walks the user straight out of it into the page behind.
  for (const [file] of DIALOGS) {
    assert.ok(!/role="dialog"/.test(code(src(file))), `${file} must take its role from Base UI`);
  }
});

test('no dialog keeps a keydown listener for Escape — the shell owns it', () => {
  // Three did: the day journal, ReplayModal and the old layout editor. Two listeners racing
  // to close the same dialog is not additive, it is a bug waiting for one of them to
  // grow a guard the other does not have. The day journal is the live example — its
  // `!saving` guard now sits on the shell's onClose, covering Escape and outside-click
  // together, where it used to guard the two paths separately. The guard outlived the
  // modal it was written for: the file is now DayJournalWorkspace, and its save is a
  // larger batch than the one-field-per-trade PATCH it replaced, so losing the dialog
  // mid-flight costs more than it used to.
  for (const [file] of DIALOGS) {
    const s = code(src(file));
    assert.ok(!/'Escape'/.test(s), `${file} must not handle Escape itself`);
  }
  assert.match(
    code(src('DayJournalWorkspace.jsx')),
    /onClose=\{\(\) => !saving && onClose\(\)\}/,
    "the journal workspace's save-in-progress guard must survive on the shell's onClose",
  );
  // ReplayModal keeps its OTHER keys — space and arrows are playback controls, not
  // dismissal — so this is a narrowing, not a removal.
  const replay = code(src('ReplayModal.jsx'));
  assert.match(replay, /e\.key === ' ' && ready/, 'space must still toggle playback');
  assert.match(replay, /e\.key === 'ArrowRight'/, 'arrows must still step the replay');
});

test('the popup is a CHILD of the backdrop — centring and dismissal both depend on it', () => {
  // Reason 1 above. Asserted structurally rather than by rendering, because the failure
  // is a computed-layout one that no static check would otherwise see.
  const s = code(shell);
  assert.match(
    s,
    /<DialogOverlay[^>]*>\s*<DialogPopup/,
    'DialogPopup must render INSIDE DialogOverlay — as siblings, nothing centres the popup',
  );
  /* MATCHED ON THE TWO GUARANTEES RATHER THAN ON THE WHOLE TAG (2026-09-03). This
     pinned the literal `className={backdrop} forceRender`, which broke the moment the
     backdrop grew its §10 entrance classes and started composing its className — even
     though `forceRender`, the thing the assertion is actually about, never moved. A
     regex over an entire JSX tag fails on any attribute change, including ones that
     cannot affect what it is guarding. Both halves are still asserted: the caller's
     class reaches the element, and the overlay force-renders. */
  assert.match(s, /<DialogOverlay[^>]*\bbackdrop\b[^>]*>/,
    "the caller's backdrop class must still reach the overlay");
  assert.match(s, /<DialogOverlay[^>]*\bforceRender\b[^>]*>/,
    'the backdrop must forceRender, or a nested dialog would take its popup down with it');
});

test("a dialog header takes the ALERT dialog's treatment, not the plain one's", () => {
  /* §3, amended 2026-09-07. The registry ships two confirm surfaces and styles their
   * headers differently — `AlertDialogTitle` is `text-lg font-medium`, `DialogTitle` is
   * `text-base leading-none font-medium`. `Modal` is built on `Dialog` and is the shell
   * for all 13 dialogs, every one of which is the ALERT shape, so it inherited the
   * quieter of the two: 2px smaller AND a line box 12px shorter.
   *
   * BOTH HALVES MATTER, which is why both are pinned. Fixing the size alone leaves
   * `leading-none` collapsing the title's line box, and it is the line box — not the
   * font size — that supplies the ~5px of optical space under the title that made the
   * preset's header look twice as open. That difference was reported as SPACING, and it
   * is not: `--spacing` is 4px, Tailwind's own base, so every padding and gap in the two
   * dialogs already resolves identically. Asserted below so the diagnosis cannot be
   * mislaid the next time someone reaches for a gap.
   *
   * AND THE OVERRIDES STAY IN THE WRAPPER. `--text-2` is the owner-locked colour for
   * labels and metadata app-wide; a dialog description is body copy, so it takes the
   * preset's `--muted` (#a1a1aa) HERE rather than by repointing the bridge, which would
   * re-colour every screen. Same call `menu.jsx` already made for menu labels. */
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const wrapper = code(dialog);

  assert.match(wrapper, /const TITLE = 'text-lg leading-7'/,
    'a dialog title is 18px on a 28px line box — leading-7 is that line box exactly');
  assert.doesNotMatch(wrapper, /const TITLE = '[^']*leading-none/,
    'leading-none is what collapsed the header; replacing the size alone does not fix it');
  assert.match(wrapper, /const DESCRIPTION = '[^']*text-\[var\(--muted\)\]/,
    "a description takes the preset's grey, not --text-2");
  assert.match(wrapper, /DialogTitle|DialogDescription/,
    'both parts must be wrapped, not re-exported bare');

  /* THE OVERRIDE MUST NOT HAVE LEAKED INTO THE BRIDGE — and on 2026-09-09 the way to
   * express that changed, so the assertion moved with it rather than being deleted.
   *
   * This used to require `--color-muted-foreground: var(--text-2)` verbatim, guarding
   * against "someone fixes the dialog by repointing muted-foreground globally, and every
   * screen in the app changes colour instead". That worry is still exactly right and is
   * still what is asserted — it is just no longer the same string.
   *
   * `--color-muted-foreground` now points at `--chrome-label`, which is CONTEXTUAL: it is
   * --text-2 on a card and the preset's --muted inside [data-overlay-surface]. So the app
   * at large is unchanged (the thing this test protects) while a floating panel gets the
   * preset's grey. The dialog is no longer "the exception" — it turned out three
   * components had each written the same exception by hand, which is what made it a token.
   * The literal above is now redundant and resolves to the same colour; it stays because
   * this component is locked. */
  assert.doesNotMatch(bridge, /--color-muted-foreground:\s*var\(--muted\)/,
    'muted-foreground must NOT be repointed flatly at the preset grey — that changes every '
    + 'card label in the app. It takes the contextual --chrome-label instead.');
  assert.match(bridge, /--color-muted-foreground:\s*var\(--chrome-label\)/,
    'muted-foreground resolves through --chrome-label, which is --text-2 on a card');
  assert.match(tokensCss, /--chrome-label:\s*var\(--text-2\)/,
    'and --chrome-label must still default to --text-2, or every card label moved');

  /* AND THE DIAGNOSIS: spacing was never the difference. */
  assert.match(bridgeSpacing, /--spacing:\s*var\(--s-1\)/,
    "the spacing base is the preset's own 4px — a density complaint is not a gap bug");
});

test("a generated heading or paragraph carries no browser margin", () => {
  /* THE FOURTH MISSING-PREFLIGHT RESET, and the one that cost the most to find because
   * it does not look like what it is.
   *
   * This app does not import Preflight (tailwind.css says why), so the UA sheet's
   * `h2 { margin-block: .83em }` and `p { margin-block: 1em }` stand. Base UI renders
   * `Dialog.Title` as an h2 and `Dialog.Description` as a p, so a dialog description
   * arrived with a 14px margin ON TOP of DialogHeader's 6px flex gap — 20px where the
   * reference has 6. A flex gap does not absorb a margin; they add.
   *
   * It was reported as spacing, then chased through the type scale, and it was neither:
   * the gap, the sizes and the 4px spacing base all measured correct. The space came
   * from a default nobody declared.
   *
   * PINNED AS A RULE, NOT AS THIS DIALOG. Any generated part that renders a heading or a
   * paragraph has the same hole — Card, Alert, Sheet, AlertDialog — so the assertion is
   * that the reset EXISTS and stays at zero specificity, which is what lets any author
   * rule still win over it. */
  assert.match(bridge, /:where\(\s*h1\[data-slot\]/,
    'the Preflight margin substitute must cover generated headings');
  assert.match(bridge, /p\[data-slot\]\s*\)\s*\{\s*margin:\s*0/,
    "and paragraphs — Dialog.Description is a <p>, which is where this was found");
  assert.doesNotMatch(bridge, /\[data-slot\] (p|h[1-6])/,
    'it must not reach into app prose inside a generated container — this app never ran Preflight');

  /* AND THE HALF THAT WAS HIDDEN. `.modal h2 { margin: 0 }` zeroed the heading for OUR
   * dialogs by accident, so only the paragraph showed and the registry parity pane —
   * which carries no `.modal` class — was wrong on both. If that legacy rule is ever
   * deleted (it should be), the reset above is what keeps the heading right. */
  assert.ok(css.includes('.modal h2 { margin: 0'),
    'if this legacy rule goes, confirm the bridge reset still zeroes the dialog heading');
});

test('the shell owns its surface — it leans on no legacy rule', () => {
  /* THIS TEST INVERTED ON 2026-09-07, and the inversion is the point. It used to assert
   * that `.modal` and `.modal-backdrop` still declared what the shell assumed, because
   * the shell restated none of it. Both rules are now DELETED and `modal.jsx` carries
   * the generated dialog's own values instead — `bg-popover p-6 shadow-xl ring-1
   * max-w-md`, with the overlay at `bg-black/30` rather than a 78% scrim.
   *
   * The old arrangement is what made every dialog render at the CARD colour behind a
   * near-opaque scrim: an unlayered legacy rule beat the skin it was sitting on. */
  assert.ok(!/^\.modal \{/m.test(css), '.modal must stay deleted — the shell owns its surface');
  assert.ok(!/^\.modal-backdrop \{/m.test(css), '.modal-backdrop must stay deleted');

  const shellCode = code(shell);
  for (const util of ['bg-popover', 'p-6', 'shadow-xl', 'max-w-md', 'bg-black/30']) {
    assert.ok(shellCode.includes(util), `the shell must carry ${util} itself now`);
  }
  // Centring is still by CONTAINMENT, so the popup must not position itself.
  assert.ok(shellCode.includes('relative w-full'),
    'the popup stays `relative` — the backdrop centres it, per the test below');
  assert.ok(!/fixed top-1\/2/.test(shellCode),
    'the skin self-centres with fixed+translate; this shell must not, or it escapes the backdrop');
});

test('the shell cancels the inherited user-select that nesting introduced', () => {
  // Base UI sets `user-select: none` inline on the Backdrop. As a sibling it never
  // reached the popup; as a parent it does, and inline styles beat classes — so every
  // modal's text would silently become unselectable. Overridden on the child, where the
  // cascade lets a class win over an inherited inline value.
  assert.match(code(shell), /'select-text'/, 'the popup must re-enable text selection');
});

test('Replay keeps its OWN surface, and that is still not cosmetic', () => {
  /* `.rp-modal` declares no padding, so it must never carry a surface that supplies one.
   * That was the argument when the default was `.modal` (24px padding). It survives the
   * 2026-09-07 migration unchanged, because the default now supplies `p-6` — the same
   * 24px, from the skin instead of from legacy CSS. The hazard is identical; only its
   * source moved, which is why `surface` stays a prop rather than becoming a constant. */
  assert.match(code(src('ReplayModal.jsx')), /surface="rp-modal" backdrop="rp-backdrop"/);
  const body = (sel) => {
    const start = css.indexOf(`${sel} {`);
    assert.ok(start !== -1, `rule ${sel} exists`);
    return css.slice(start, css.indexOf('}', start));
  };
  assert.ok(!/padding:/.test(body('.rp-modal')),
    '.rp-modal declares no padding — that is precisely why it must not carry the default surface');
  assert.match(code(shell), /p-6/,
    'and the default surface still supplies the padding it would inherit');
});

test('the shell composes its own overlay so the scrim stays a token', () => {
  // The generated DialogContent hardcodes <DialogOverlay /> with no className, and its
  // scrim is `bg-black/30` — a raw colour literal the locked no-literals rule forbids
  // and that the light theme would not flip. Six lines of composition buy that back.
  assert.ok(!/DialogContent/.test(code(dialog)), 'DialogContent must not be re-exported');
  assert.match(code(shell), /DialogPortal/);
  assert.match(code(shell), /DialogOverlay/);
  assert.match(code(shell), /DialogPopup/);
  assert.match(code(barrel), /export \{ Modal \} from '\.\/modal\.jsx'/);
});

test('an overlay opened inside a modal portals INTO the modal, not beside its scrim', () => {
  // THE BUG THIS PINS. The Journal workspace's Filter menu opened, took focus, and was
  // invisible. Given no container, Base UI's portal does not go to <body> — it goes to
  // `parentPortalNode ?? document.body`, so a menu inside a modal landed in the dialog's
  // portal node as a SIBLING of the backdrop. That node sets no z-index, so the two were
  // compared in the root stacking context: the generated positioner's hardcoded `z-50`
  // against `.modal-backdrop`'s `z-index: 2147483000`. The menu lost and painted under
  // the scrim. It is not fixable with a bigger number — the generated Positioner takes
  // no className, and the dropdown tier sitting BELOW modal is correct for every menu
  // that belongs to the page. Containment is the fix: a menu that belongs to a modal is
  // rendered inside it and inherits its place in the ladder.
  const container = code(src('components/primitives/overlay-container.js'));
  const menu = code(src('components/primitives/menu.jsx'));
  const generated = code(src('components/ui/dropdown-menu.jsx'));
  const s = code(shell);

  // The shell publishes its popup — only it knows what that element is.
  assert.match(s, /<DialogPopup\s+ref=\{popupRef\}/, 'the shell must capture its popup element');
  assert.match(s, /<OverlayContainerContext\.Provider value=\{popupRef\}>/,
    'the popup must be published to the overlays rendered inside it');
  // A ref, not state: the value is stable from the first render, so publishing it costs
  // no re-render in the twelve modals that open no overlay at all.
  assert.match(s, /const popupRef = useRef\(null\)/);

  // The default is `undefined`, and that is load-bearing rather than stylistic: Base UI
  // treats an explicit `null` container as "not resolved yet" and renders NOTHING, so a
  // null default would break every menu in the app that is not inside a modal.
  assert.match(container, /createContext\(undefined\)/,
    'the default container must be undefined — an explicit null makes the portal render nothing');

  // The primitive reads it from context rather than taking it as a prop: where an
  // overlay has to render is not a call site's decision.
  assert.match(menu, /const container = useOverlayContainer\(\)/);
  assert.match(menu, /container=\{container\}/);

  // ⚠️ And the one hand-edit in the generated layer, which a `shadcn add` would silently
  // revert. The generated content builds its own Portal and exposes nothing of it, so
  // without this pass-through the primitive above has nowhere to send the container.
  assert.match(generated, /<MenuPrimitive\.Portal container=\{container\}>/,
    'PROPVEXIS EDIT lost: dropdown-menu.jsx must forward `container` to its Portal');

  // The number that makes all of the above necessary. If this ever stops being the
  // largest value in the ladder, read the comment in overlay-container.js before
  // deleting anything here.
  // The number moved from `.modal-backdrop` into the shell when that rule was deleted
  // (2026-09-07). The invariant is unchanged: the scrim must outrank the dropdown tier,
  // which is WHY overlays inside a modal are contained rather than raised.
  assert.match(code(shell), /z-\[2147483000\]/,
    'the scrim outranks the dropdown tier — which is why overlays are contained, not raised');
});

test('TradePreview is still hand-rolled, and is deliberately NOT in the list above', () => {
  // The one dialog-shaped surface left. It is a right slide-in DRAWER — an <aside> with
  // its own slide animation, not a centred box — and UI-MIGRATION-PLAN §8 scopes Drawer
  // as a component separate from Modal. Its a11y gap is real and unfixed: no focus trap,
  // no Escape, no scroll lock. This test fails the day someone points the Modal shell at
  // it, because the shell renders a centred <div> and would drop both the <aside>
  // semantics and the slide-in.
  const tp = code(src('TradePreview.jsx'));
  assert.match(tp, /className="tp-backdrop"/, 'still the hand-rolled drawer — see the plan, not a bug');
  assert.ok(!/<Modal\b/.test(tp), 'a drawer needs a Drawer, not the centred Modal shell');
});
