import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss, tokensCss, bridgeCss } from './helpers/app-css.js';

// Phase 4b — the top bar's four overlays (user menu, account switcher, notification
// feed, filter builder) moved from hand-rolled open/close onto Base UI. The point of
// that migration is entirely behavioural, which makes it the kind of change a test
// suite normally cannot see: the markup is identical, the CSS classes are identical,
// and the existing assertions in filter-panel.test.js kept passing throughout. What
// changed is keyboard, focus and ARIA — so those are what this file pins.
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

test('the MENU now takes the preset skin; the POPOVERS deliberately do not yet', () => {
  // THIS TEST'S PREMISE REVERSED ON 2026-08-05. It used to require that the primitives
  // contribute NO appearance — the caller's legacy class was the whole surface, because
  // the migration was behaviour-only by decision. The owner reversed that decision:
  // DESIGN-LANGUAGE now locks "the preset outranks legacy CSS", so a generated
  // component's appearance is the correct one and the legacy rule is deleted.
  //
  // So `menu.jsx` must now point at the generated component, and the assertion that it
  // stays bare would be asserting the old decision.
  assert.match(menu, /from '@\/components\/ui\/dropdown-menu'/,
    'menu.jsx must render the generated component, skin included');
  assert.match(menu, /overlay-motion/, 'and animate on the §10 recipe, not shadcn\'s duration-100');

  // The two POPOVERS (notification feed, filter builder) are still on bare Base UI, and
  // that is a scope boundary rather than an omission — this increment was menus only, so
  // that a half-reskinned set never ships. This assertion is what makes the boundary
  // visible instead of forgettable, and it fails the day popover.jsx is migrated, which
  // is when this test should be rewritten to match the menu's above.
  assert.ok(!/components\/ui\/popover/.test(popover),
    'popover.jsx is still bare Base UI — when that changes, update this test with it');
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
  // The popover still routes through the token, so the utility must keep resolving.
  assert.match(popover, /className="z-dropdown"/);
  assert.match(bridgeCss, /@utility z-dropdown \{ z-index: var\(--z-dropdown\); \}/);
});
