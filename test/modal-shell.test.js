import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';

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
const src = (f) => read(`../frontend/src/${f}`);

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
  ['DayJournalModal.jsx', 'modal'],
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
  // Three did: DayJournalModal, ReplayModal and DashLayoutEditor. Two listeners racing
  // to close the same dialog is not additive, it is a bug waiting for one of them to
  // grow a guard the other does not have. DayJournalModal is the live example — its
  // `!saving` guard now sits on the shell's onClose, covering Escape and outside-click
  // together, where it used to guard the two paths separately.
  for (const [file] of DIALOGS) {
    const s = code(src(file));
    assert.ok(!/'Escape'/.test(s), `${file} must not handle Escape itself`);
  }
  assert.match(
    code(src('DayJournalModal.jsx')),
    /onClose=\{\(\) => !saving && onClose\(\)\}/,
    "DayJournalModal's save-in-progress guard must survive on the shell's onClose",
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
