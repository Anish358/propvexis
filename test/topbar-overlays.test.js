import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';

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

test('keyboard focus in a menu is VISIBLE — every hover rule has a data-highlighted twin', () => {
  // The one that silently breaks. Base UI marks the arrow-key-focused item with
  // [data-highlighted], not :hover. Miss it and focus moves through the menu with
  // nothing changing on screen — the migration would look done and be unusable by
  // keyboard, which is the exact thing it was for.
  for (const cls of ['.tb-menu-item', '.tb-menu-item.danger', '.acct-opt']) {
    const esc = cls.replace(/\./g, '\\.');
    const hover = new RegExp(`${esc}:hover`);
    const kbd = new RegExp(`${esc}\\[data-highlighted\\]`);
    assert.match(css, hover, `${cls} should still have its hover treatment`);
    assert.match(css, kbd, `${cls} has no [data-highlighted] rule — keyboard focus would be invisible`);
  }
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
  assert.match(bar, /aria-hidden="true"/, 'the decorative tick input must be hidden from AT');
  assert.match(bar, /tabIndex=\{-1\}/, 'the decorative tick input must be out of the tab order');
});

test('the primitives contribute no appearance of their own', () => {
  // The whole reason these wrap Base UI rather than the generated components: the
  // caller's legacy class is the entire surface. A utility creeping in here would
  // restyle four overlays at once, and none of them has a DLS rule authorising it.
  for (const [name, src] of [['menu', menu], ['popover', popover]]) {
    const classNames = [...code(src).matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    for (const c of classNames) {
      assert.equal(c, 'z-dropdown',
        `${name}.jsx applies "${c}" — the only class it may carry is the stacking token`);
    }
  }
});

test('stacking uses our z-index token, not Tailwind z-50', () => {
  // The generated components hardcode z-50, which knows nothing about our ladder
  // (--z-nav 30, --z-dropdown 40, --z-modal, --z-toast). A dropdown at 50 would sit
  // above the top bar it belongs to but below nothing in particular.
  for (const src of [menu, popover]) {
    assert.match(src, /className="z-dropdown"/);
    assert.ok(!/z-50/.test(code(src)), 'must not fall back to Tailwind z-50');
  }
});
