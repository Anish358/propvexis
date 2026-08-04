import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss, tokensCss, bridgeCss, legacyCss } from './helpers/app-css.js';

// Phase 4b — the top bar's four overlays: user menu, account switcher, notification feed,
// filter builder. They were migrated in TWO passes, and this file now pins both.
//
//   2026-08-04  BEHAVIOUR. Hand-rolled open/close moved onto Base UI. Deliberately
//               invisible: identical markup, identical CSS classes. Only keyboard, focus
//               and ARIA changed.
//   2026-08-05  APPEARANCE. The owner locked "the preset outranks legacy CSS", so the
//               generated skin was adopted and the legacy surface and item rules deleted.
//
// Several tests below therefore assert the OPPOSITE of what they once did, and each says
// so where it does. That is not churn: the first pass was scoped behaviour-only by an
// explicit decision, and the second reversed that decision. A test that pinned the first
// scope would now be pinning a choice the owner overruled.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const bar = read('../frontend/src/FilterBar.jsx');
const notif = read('../frontend/src/Notifications.jsx');
const menu = read('../frontend/src/components/primitives/menu.jsx');
const popover = read('../frontend/src/components/primitives/popover.jsx');
const css = appCss;

// Strip comments before asserting on code. These files explain at length WHY the
// hand-written roles and Tailwind's z-50 are gone, so a naive grep finds them in the
// prose and reports the very thing that was removed as still present.
const code = (src) => src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')  // JSX block comments
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('the overlays are on the primitives, not on hand-rolled state', () => {
  for (const [name, src] of [['FilterBar', bar], ['Notifications', notif]]) {
    // Six of these listeners were the entire dismissal story. Each one closed on
    // mousedown-outside and did nothing for Escape, focus or the keyboard.
    assert.ok(!/document\.addEventListener\('mousedown'/.test(src),
      `${name} still hand-rolls an outside-click listener`);
    assert.match(src, /from '@\/components\/primitives'/, `${name} must import the primitives`);
  }
  assert.match(bar, /<MenuContent className="tb-user-menu">/, 'the user menu is a Menu');
  assert.match(bar, /<MenuContent className="acct-menu">/, 'the account switcher is a Menu');
  assert.match(notif, /<PopoverContent className="notif-panel"/, 'the notification feed is a Popover');
  assert.match(bar, /<PopoverTrigger className={`tb-btn/, 'the filter builder is a Popover');
});

test('the hand-written role="menu" attributes are gone, because the primitive owns them', () => {
  // UserMenu used to declare role="menu" + role="menuitem" and implement none of the
  // behaviour those roles promise — no arrow keys, no Escape, no focus return. An ARIA
  // contract that lies is worse than absent roles: a screen reader announces a menu
  // and then the menu does not behave like one.
  const src = code(bar);
  assert.ok(!/role="menuitem"/.test(src), 'menu item roles must come from Base UI, not by hand');
  assert.ok(!/role="menu"/.test(src), 'the menu role must come from Base UI, not by hand');
});

test('keyboard focus in a menu is VISIBLE — now the library\'s job, not a twin rule', () => {
  // THE SHAPE OF THIS TEST INVERTED ON 2026-08-05, and that is the win rather than a
  // relaxation. It used to require a `[data-highlighted]` twin beside every `:hover` on
  // `.tb-menu-item`, `.tb-menu-item.danger` and `.acct-opt`, because legacy CSS styled
  // hover only — so arrow-keying moved focus with nothing changing on screen. It was the
  // one that silently breaks.
  //
  // Those three rules are now DELETED: the generated dropdown-menu owns item styling and
  // styles `focus:`, which Base UI sets for pointer AND keyboard. So the requirement is
  // asserted at its new home, and the old hazard is asserted GONE — a re-added legacy
  // rule would be a menu with two styling systems, which is the drift this guards.
  for (const cls of ['.tb-menu-item', '.acct-opt']) {
    const esc = cls.replace(/\./g, '\\.');
    assert.ok(!new RegExp(`${esc}[\\s:,{[]`).test(css),
      `${cls} is back in legacy CSS — the generated item owns menu rows now`);
  }
  const dd = read('../frontend/src/components/ui/dropdown-menu.jsx');
  assert.match(dd, /focus:bg-accent/, 'the generated item must style focus, covering both input devices');
  // And the locked neutral-chrome rule, which this now depends on entirely: shadcn's
  // `accent` means "subtle hover background", ours means "brand blue". If the bridge ever
  // stopped remapping it, `focus:bg-accent` would turn every menu row bright blue — the
  // §14 violation the migration plan flagged as R2, now reachable through the skin.
  assert.match(bridgeCss, /--color-accent:\s*var\(--surface-hover\)/,
    'focus:bg-accent must resolve to a neutral surface — see DESIGN-LANGUAGE §14');
});

test('overlay surfaces declare no positioning — the Positioner owns placement', () => {
  // These four rules used to pin themselves with position/top/right/z-index against a
  // `position: relative` parent. Base UI portals the popup to <body>, so a leftover
  // absolute offset would position it against the document instead of the trigger and
  // park it in a corner. Appearance stays in CSS; placement does not.
  const surfaces = ['.tb-user-menu', '.acct-menu', '.notif-panel', '.fp-stack'];
  for (const sel of surfaces) {
    const start = css.indexOf(`${sel} {`);
    assert.ok(start !== -1, `rule ${sel} exists`);
    const body = css.slice(start, css.indexOf('}', start));
    for (const prop of ['position:', 'z-index:']) {
      assert.ok(!body.includes(prop), `${sel} must not declare ${prop} — the Positioner places it`);
    }
  }
});

test('the filter cascade keeps the containing block its measurements need', () => {
  // .fp-stack lost its positioning to the Positioner, but .fp-cascade must NOT — the
  // values column is absolutely positioned against it, and FilterPanel's layout effect
  // lines that column up with the row that opened it.
  //
  // Why portaling the panel is safe at all: those measurements are DELTAS between two
  // getBoundingClientRect() calls (the row's top minus the cascade's top). Both are
  // viewport-relative, so the difference is identical wherever the panel is mounted and
  // whatever its offsetParent is. Tidying `position: relative` off .fp-cascade is what
  // would break it, not the portal.
  assert.match(css, /\.fp-cascade \{[^}]*position: relative/);
  assert.match(css, /\.fp-menu--values \{[^}]*position: absolute/);
});

test('the account rows stay open when checked, and say so', () => {
  // "Checkboxes keep it open" was previously achieved by having no dismissal logic at
  // all — the behaviour was an accident of the bug. Now it is a declared prop, and the
  // rows carry real menuitemcheckbox semantics instead of a bare <input> in a <label>.
  assert.match(menu, /closeOnClick=\{false\}/, 'MenuCheckboxItem must not close on activation');
  assert.match(bar, /<MenuCheckboxItem/, 'account rows are checkbox menu items');
  // The decorative `aria-hidden` / `tabIndex={-1}` input this used to assert is GONE as
  // of 2026-08-05. It existed to draw a tick while the real state lived in the prop —
  // two representations of one fact, kept in sync by hand. The generated checkbox item
  // renders its own indicator from `checked`, so the state is expressed once.
  assert.ok(!/type="checkbox"/.test(code(bar)),
    'the hand-mirrored tick input must not come back — the generated item renders its own');
  const dd = read('../frontend/src/components/ui/dropdown-menu.jsx');
  assert.match(dd, /CheckboxItemIndicator/, 'the indicator must come from the primitive');
});

test('a menu item that is a LINK is not browser-default blue', () => {
  // A REAL REGRESSION, caught in the running app rather than by this suite, which is why
  // it now has a test. `<MenuItem render={<Link/>} />` renders a real <a>. The deleted
  // `.tb-menu-item` rule had been declaring `color` and `text-decoration: none` — quietly
  // doing Preflight's job. The generated item sets NO resting colour, because shadcn is
  // written against Preflight, and Preflight is deliberately not imported here (R1). So
  // deleting the legacy rule exposed the UA default and two menu items turned blue and
  // underlined.
  //
  // The fix is the scoped reset §12 always allowed for, not a re-added legacy class. This
  // asserts three things: the reset exists, it is scoped to generated components only, and
  // it has ZERO specificity — the difference between a reset and an opinion, and what lets
  // deliberate rules like `.auth-alt a` still win.
  assert.match(bridgeCss, /:where\(a\[data-slot\], \[data-slot\] a\)/,
    'the anchor reset must be scoped to generated components and specificity-free');
  assert.match(bridgeCss, /:where\(a\[data-slot\][\s\S]{0,120}text-decoration: none/,
    'it must neutralise the UA underline as well as the colour');
  // And the reason it is needed at all, so this test explains itself if Preflight is ever
  // enabled and someone wonders whether the reset is still doing anything.
  const tw = read('../frontend/src/tailwind.css');
  assert.ok(!/@import "tailwindcss"/.test(tw) || /PREFLIGHT IS NOT IMPORTED/.test(tw),
    'if Preflight is ever imported globally, revisit this reset — it may be redundant');
});

test('all four top-bar overlays take the preset skin', () => {
  // THIS TEST'S PREMISE REVERSED ON 2026-08-05. It used to require that the primitives
  // contribute NO appearance — the caller's legacy class was the whole surface, because
  // the migration was behaviour-only by decision. The owner reversed that decision:
  // DESIGN-LANGUAGE now locks "the preset outranks legacy CSS", so a generated
  // component's appearance is the correct one and the legacy rule is deleted.
  assert.match(menu, /from '@\/components\/ui\/dropdown-menu'/,
    'menu.jsx must render the generated component, skin included');
  assert.match(popover, /from '@\/components\/ui\/popover'/,
    'popover.jsx must render the generated component, skin included');
  for (const [name, src] of [['menu', menu], ['popover', popover]]) {
    assert.match(src, /overlay-motion/,
      `${name}.jsx must animate on the §10 recipe, not shadcn's duration-100`);
  }
});

test('the popover cancels the three utilities that would double its content\'s spacing', () => {
  // `w-72 gap-4 p-4` describe a self-contained panel, and both of this app's popovers
  // hold content that already spaces itself. `gap-4` in particular is the THIRD time this
  // exact doubling has appeared — Card, then Modal, now Popover — which is why it is
  // cancelled at the primitive rather than at each call site.
  //
  // `p-0` is the one with a visible failure mode rather than a merely loose one: the
  // notification rows carry their own padding and their dividers span the full width, so
  // 16px of popup padding insets every row and leaves the dividers short of both edges.
  for (const u of ['w-auto', 'gap-0', 'p-0']) {
    assert.match(popover, new RegExp(u.replace('-', '\\-')), `popover must cancel with ${u}`);
  }
  // And the surface variant, which exists because one popover is not a panel at all.
  assert.match(popover, /surface = 'panel'/, 'a popover is a panel by default');
  assert.match(bar, /<PopoverContent surface="none">/,
    'the filter builder must drop the box — its content is already made of panels');
  // The layer rule this enforces: a page may not originate appearance. An earlier version
  // passed `bg-transparent shadow-none ring-0` from FilterBar, which put visual values in
  // the Pages layer and made utility-collisions' class harvest meaningless.
  assert.ok(!/className="(bg|shadow|ring|p|w|gap)-/.test(code(bar)),
    'FilterBar must not carry raw utilities — express the intent as a primitive prop');
});

test('stacking: the preset owns the menu\'s z-index, and the token agrees with it', () => {
  // The generated Positioner hardcodes `z-50` and accepts no className, so menu.jsx can
  // no longer pass `z-dropdown`. Leaving `--z-dropdown: 40` would mean two disagreeing
  // values for one concept — exactly the failure the bridge exists to prevent — so the
  // token was reconciled to 50, toward the preset, per the precedence rule.
  //
  // What actually matters is the ORDER, not the number, so that is what this pins.
  const z = (name) => {
    const m = tokensCss.match(new RegExp(`--z-${name}:\\s*(\\d+)`));
    assert.ok(m, `--z-${name} exists`);
    return Number(m[1]);
  };
  assert.ok(z('nav') < z('dropdown'), 'a dropdown must sit above the nav it belongs to');
  assert.ok(z('dropdown') < z('toast'), 'a toast must sit above an open dropdown');
  assert.ok(z('toast') < z('modal'), 'a modal must sit above everything');
  assert.equal(z('dropdown'), 50, 'must match the generated Positioner\'s hardcoded z-50');
  // Neither primitive passes `z-dropdown` any more — both generated Positioners hardcode
  // z-50 and accept no className. The utility stays registered because legacy CSS still
  // uses the token (the bulk-action menu), and because the token is what the ladder above
  // is asserted against. Reconciling the VALUE is what keeps those two facts compatible.
  assert.match(bridgeCss, /@utility z-dropdown \{ z-index: var\(--z-dropdown\); \}/);
  assert.match(legacyCss, /z-index: var\(--z-dropdown\)/,
    'the token still has a legacy consumer — do not retire it with the primitives');
});
