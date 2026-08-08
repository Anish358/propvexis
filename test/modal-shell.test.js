import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
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

// Strip comments before asserting on code. These files explain at length WHY the
// hand-rolled backdrops, portals and stopPropagation calls are gone, so a naive grep
// finds them in the prose and reports the very thing that was removed as still present.
const code = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX block comments
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// Every dialog in the app, and the surface each one renders on. Thirteen, not the
// eleven the original audit counted: SetTargetModal is declared inline inside
// Dashboard.jsx, and DashLayoutEditor uses `.dle-*` classes, so neither turned up in a
// grep for `*Modal.jsx` or `.modal-backdrop`.
const DIALOGS = [
  ['AccountsModal.jsx', 'modal'],
  ['AddTradeModal.jsx', 'modal'],
  ['DayJournalWorkspace.jsx', 'modal'],
  ['DayTradesModal.jsx', 'modal'],
  ['FeesModal.jsx', 'modal'],
  ['ImportTradesModal.jsx', 'modal'],
  ['PayoutsModal.jsx', 'modal'],
  ['StrategyRulesModal.jsx', 'modal'],
  ['TagModal.jsx', 'modal'],
  ['TradeSettingsModal.jsx', 'modal'],
  ['Dashboard.jsx', 'modal'],          // SetTargetModal, inline
  ['ReplayModal.jsx', 'rp-modal'],     // its own 960x640 chart frame
  ['DashLayoutEditor.jsx', 'dle-panel'], // its own light-scrim editor panel
];

test('all thirteen dialogs are on the shared shell', () => {
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
  // Three did: the day journal, ReplayModal and DashLayoutEditor. Two listeners racing
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
  assert.match(s, /<DialogOverlay className=\{backdrop\} forceRender>/,
    'the backdrop must forceRender, or a nested dialog would take its popup down with it');
});

test('the legacy CSS the shell leans on still declares what the shell assumes', () => {
  // The shell restates none of this — it reuses the rule that already had it, so the
  // 24px inset that `.modal`\'s `width: 100%` resolves against stays a single source of
  // truth. Which means a change to these two rules is a change to every modal.
  const rule = (sel) => {
    const start = css.lastIndexOf(`${sel} {`);
    assert.ok(start !== -1, `rule ${sel} exists`);
    return css.slice(start, css.indexOf('}', start));
  };
  const backdrop = rule('.modal-backdrop');
  for (const prop of ['position: fixed', 'inset: 0', 'align-items: center', 'justify-content: center']) {
    assert.ok(backdrop.includes(prop), `.modal-backdrop must keep ${prop} — it centres the popup`);
  }
  assert.match(backdrop, /padding: 24px/, '.modal-backdrop\'s padding is the modal\'s viewport gap');
  // And the reason the popup cannot centre itself with utilities.
  assert.match(rule('.modal'), /position: relative/,
    '.modal is unlayered and declares position — a `fixed` utility on the popup would lose to it');
});

test('the shell cancels the inherited user-select that nesting introduced', () => {
  // Base UI sets `user-select: none` inline on the Backdrop. As a sibling it never
  // reached the popup; as a parent it does, and inline styles beat classes — so every
  // modal's text would silently become unselectable. Overridden on the child, where the
  // cascade lets a class win over an inherited inline value.
  assert.match(code(shell), /'select-text'/, 'the popup must re-enable text selection');
});

test('Replay and the layout editor keep their OWN surface, and that is not cosmetic', () => {
  // Both surfaces override most of what `.modal` declares — being later in the sheet —
  // but each MISSES a different property, and inherits it if `.modal` is added
  // alongside. Neither is a visual nitpick; both are A1 layout changes, which is why
  // the base class is a prop with a default rather than a constant:
  //
  //   .rp-modal   declares no padding   -> would gain .modal's 24px, shrinking the chart
  //   .dle-panel  declares no max-width -> would gain .modal's 560px cap, and it is 620px
  assert.match(code(src('ReplayModal.jsx')), /surface="rp-modal" backdrop="rp-backdrop"/);
  assert.match(code(src('DashLayoutEditor.jsx')), /surface="dle-panel"/);
  assert.match(code(src('DashLayoutEditor.jsx')), /backdrop="dle-backdrop"/);
  const body = (sel) => {
    const start = css.indexOf(`${sel} {`);
    assert.ok(start !== -1, `rule ${sel} exists`);
    return css.slice(start, css.indexOf('}', start));
  };
  assert.ok(!/padding:/.test(body('.rp-modal')),
    '.rp-modal declares no padding — that is precisely why it must not carry .modal');
  assert.ok(!/max-width:/.test(body('.dle-panel')),
    '.dle-panel declares no max-width — that is precisely why it must not carry .modal');
  // And the values it would inherit, so this test fails if .modal's own numbers move.
  assert.match(css, /\.modal \{[^}]*padding: 24px/, '.modal still has the padding rp-modal would inherit');
  assert.match(css, /\.modal \{[^}]*max-width: 560px/, '.modal still has the cap dle-panel would inherit');
  assert.match(code(shell), /surface = 'modal'/, 'the shared surface stays the default');
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
  assert.match(css, /\.modal-backdrop \{[^}]*z-index: 2147483000/,
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
