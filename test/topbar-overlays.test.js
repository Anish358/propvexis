import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss, tokensCss, bridgeCss, legacyCss } from './helpers/app-css.js';
import { readSrc } from './helpers/src-files.js';

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
const bar = read('../frontend/src/features/filters/FilterBar.jsx');
const notif = read('../frontend/src/features/alerts/Notifications.jsx');
const menu = read('../frontend/src/components/primitives/menu.jsx');
const popover = read('../frontend/src/components/primitives/popover.jsx');
const tw = read('../frontend/src/tailwind.css');
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
  /* THE USER MENU IS GONE (2026-08-28, owner call) — the rail's footer already carried
   * the same person's name, plan and avatar, so the bar's copy was the second one. Its
   * contents each have a verified home: Trade settings is mounted by TradeLog with its
   * own trigger, Manage plan is a Settings route, and Sign out is Settings > Session,
   * which the rail's identity row links to. Asserted as ABSENT so it cannot quietly
   * return alongside the rail's row. */
  assert.ok(!bar.includes('tb-user-menu'), 'the top bar must not carry a second identity menu');
  assert.match(bar, /<MenuContent className="acct-menu">/, 'the account switcher is a Menu');
  assert.match(notif, /<PopoverContent className="notif-panel"/, 'the notification feed is a Popover');
  // UPDATED 2026-08-05 (Phase 4c). This used to read ``<PopoverTrigger className={`tb-btn``
  // — it pinned the trigger's LEGACY CLASS as proof the popover existed, which is why it
  // broke the moment the trigger became a component. What it means to assert is that the
  // trigger renders a real Button, so that is what it asserts now.
  assert.match(bar, /<PopoverTrigger render=\{\(\s*\n\s*<Button\s*\n\s*variant="chrome"/,
    'the filter builder is a Popover whose trigger is a generated Button');
});

test('the top bar\'s CONTROLS are generated components, not just its overlays', () => {
  // PHASE 4c, and the reason it needed its own increment. Phase 4b moved this bar's four
  // overlays onto Base UI and deliberately left every TRIGGER on its legacy class, so
  // behaviour migrated and nothing visible did — the owner reported being unable to see
  // any change, which is exactly what "legacy CSS is unlayered, so a reskin that leaves
  // the legacy rule in place has not changed anything" predicts.
  //
  // These five names are what carried the old appearance. The rule they broke is that the
  // preset can only win by DELETION, so the test is that they are gone from the stylesheet
  // — not merely unused in the JSX, which is the weaker thing that would still leave the
  // rules able to outrank a utility.
  for (const cls of ['.tb-btn', '.tb-badge', '.tb-icon-btn', '.tb-avatar', '.acct-switch-btn',
    '.fb-unit', '.notif-bell', '.notif-badge']) {
    const esc = cls.replace(/\./g, '\\.');
    assert.ok(!new RegExp(`${esc}[\\s:,{[]`).test(css),
      `${cls} is back in legacy CSS — the preset outranks it, so it must stay deleted`);
  }
  // And each control is the component that replaced it.
  assert.match(bar, /<ToggleGroupExclusive value=\{unit\}/, 'the unit switch is a ToggleGroup');
  assert.match(bar, /render=\{<Button variant="tinted"/, 'the account switcher trigger is a Button');
  /* THE AVATAR LEFT THE BAR (2026-08-28) — see the note on tb-user-menu above. The rail
   * footer's identity row holds it now, and that one is a RailAvatar (a photo when the
   * account has one, two-letter initials when it does not). Asserted there instead, so
   * the guarantee this line carried — the identity mark is a component, not a
   * hand-rolled circle — still has somewhere to live. */
  const rail = readSrc('components/primitives/rail.jsx');
  assert.match(rail, /export function RailAvatar/, 'the identity mark is a primitive');
  assert.ok(!bar.includes('<Avatar'), 'the top bar no longer draws an avatar');
  assert.match(notif, /render=\{<Button variant="chrome"/, 'the bell is a Button');
  for (const [name, src] of [['FilterBar', bar], ['Notifications', notif]]) {
    assert.match(src, /<CountBadge/, `${name} counts use the CountBadge primitive`);
  }
});

test('the unit switch cannot end up with neither unit selected', () => {
  // Base UI's `multiple={false}` still allows un-pressing the pressed item, which for a
  // mode switch means a state where no unit is chosen and every figure on the page has no
  // unit to render in. The old two-<button> version could not reach it because neither
  // button ever deselected; the ToggleGroup can, so the guard is explicit.
  const tg = read('../frontend/src/components/primitives/toggle-group.jsx');
  assert.match(tg, /if \(next\.length\)/, 'an empty selection must be refused, not forwarded');
  // And the semantics the hand-rolled pair never had: two independent buttons in a
  // role="group" whose selected state lived only in a CSS class told a screen reader
  // nothing about which was active.
  const toggle = read('../frontend/src/components/ui/toggle.jsx');
  assert.match(toggle, /data-pressed:/, 'the pressed state must be a real attribute, not a class');
});

test('an overlay trigger that is a Button must forward its ref', () => {
  // The limitation primitives/index.js documented, coming due. The generated components
  // are plain function components written against React 19, where `ref` is an ordinary
  // prop; this app is on React 18.3, where a ref handed to a function component is dropped
  // with a warning. Harmless while every Button was a leaf.
  //
  // Phase 4c made four of them overlay TRIGGERS. Base UI measures the trigger element to
  // place the popup and refocuses it on close, so a dropped ref is a menu anchored to
  // nothing and focus landing on <body> — a failure that shows up as "the dropdown appears
  // in the corner", which is hard to trace back to a missing ref.
  const btn = read('../frontend/src/components/primitives/button.jsx');
  assert.match(btn, /React\.forwardRef/, 'the Button primitive must forward refs');
  assert.match(btn, /from '@base-ui\/react\/button'/,
    'it must render the Base UI Button, which is a real forwardRef — not the generated wrapper');
  // The skin must still be entirely the preset's: rendering the primitive directly is a
  // ref fix, and it would be a licence to invent styling if the cva were not reused.
  assert.match(btn, /buttonVariants\(\{/, 'the generated cva is still the only source of the skin');
  assert.match(btn, /data-slot="button"/,
    'data-slot is the component\'s public hook — legacy geometry rules select on it');
  // And every trigger that renders a Button relies on it.
  for (const [name, src] of [['FilterBar', bar], ['Notifications', notif]]) {
    for (const m of code(src).matchAll(/<(Menu|Popover)Trigger\s+render=\{<(\w+)/g)) {
      assert.equal(m[2], 'Button', `${name} renders a trigger as <${m[2]}> — it must be ref-forwarding`);
    }
  }
});

test('a utility written in a page is a no-op, so pages carry none', () => {
  // CAUGHT DURING PHASE 4c, in the built CSS rather than by review. The first pass at this
  // increment put `truncate`, `opacity-60` and `max-w-[200px]` on elements in FilterBar.
  // All three are valid Tailwind and all three compiled to NOTHING: `@source` is scoped to
  // `components/ui` and `components/primitives` (deliberately — widening it harvests
  // utility candidates out of hyphenated legacy class names like `dash-grid`), so Tailwind
  // never saw them. `relative` and `rounded-full` DID work, which is worse — they were
  // emitted only because some component happened to use the same name, so the page was
  // silently depending on an unrelated file.
  //
  // The rule that falls out: a page gets legacy classes or nothing. Appearance goes in a
  // primitive; page-level geometry goes in legacy CSS on a surviving hook.
  const sources = [...tw.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sources.every((s) => s.startsWith('./components/')),
    'if @source ever widens past components/, this whole test can be deleted — until then it holds');

  // A Tailwind-shaped token is one whose FIRST segment is a known utility root. Legacy
  // names (`tb-acct`, `notif-panel`, `acct-switch-cur`) never are, which is what makes the
  // two distinguishable without a full utility list.
  const ROOTS = /^(bg|text|border|ring|shadow|rounded|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min|max|flex|grid|gap|items|justify|self|absolute|relative|fixed|sticky|inline|block|hidden|opacity|truncate|font|tracking|leading|size|space|overflow|z|cursor|select|transition|tabular)$/;
  for (const [name, src] of [['FilterBar', bar], ['Notifications', notif]]) {
    for (const m of code(src).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const tok of (m[1] ?? m[2] ?? '').split(/\s+/).filter(Boolean)) {
        if (tok.includes('${')) continue;              // interpolated legacy class
        const root = tok.split('-')[0].replace(/\[.*/, '');
        assert.ok(!ROOTS.test(root),
          `${name}: "${tok}" looks like a Tailwind utility, and a utility in a page is never compiled`);
      }
    }
  }
});

test('a page originates no appearance — the top bar included', () => {
  // The rule Phase 4c had to be redone to respect. An early pass at this increment spelled
  // the count pills and the icon-button treatment out as utility strings in FilterBar and
  // Notifications: `bg-muted`, `text-muted-foreground`, `rounded-full`, `bg-destructive`.
  // That puts visual values in the pages layer AND defeats utility-collisions' class
  // harvest, which can only reason about appearance it finds in components/.
  //
  // So both files were reworked to name intent — `variant="chrome"`, `<CountBadge
  // tone="alert">` — and this pins it. Geometry is still allowed at a call site (a width
  // cap, `truncate`, the `relative` a corner badge positions against); colour, fill,
  // shadow and ring are not.
  const APPEARANCE = /\b(bg|text|border|ring|shadow|from|to|via)-(?!\[)[a-z]/;
  for (const [name, src] of [['FilterBar', bar], ['Notifications', notif]]) {
    for (const m of code(src).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const list = m[1] ?? m[2] ?? '';
      for (const tok of list.split(/\s+/).filter(Boolean)) {
        // Legacy hooks (`tb-acct`, `notif-panel`) and geometry (`truncate`, `relative`,
        // `max-w-[200px]`) fall through; only a colour/fill/edge utility trips this.
        assert.ok(!APPEARANCE.test(tok),
          `${name} originates appearance in className: "${tok}" — express it as a primitive prop`);
      }
    }
  }
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

// ── The two chrome pills' hover — Filters and the bell ───────────────────────

test('the chrome pill answers every one of ghost\'s background classes in its own modifier set', () => {
  /* THE BUG THIS PINS, and it shipped invisible for a week (fixed 2026-09-02).
   *
   * Both controls in this file's scope — the Filters button and the notification bell —
   * are `variant="chrome" size=… pill`. `chrome` maps to the generated `ghost`, and
   * `pill` then restates the surface the design draws (--control-bg, hovering to
   * --surface-hover). That restatement only lands if tailwind-merge DELETES ghost's
   * version, and tailwind-merge deletes a class only when the modifier sets match
   * exactly: `hover:bg-[…]` removes `hover:bg-muted` and leaves `dark:hover:bg-muted/50`
   * and `aria-expanded:bg-muted` untouched.
   *
   * Both survivors then beat the pill in the cascade — `dark:hover:` is emitted later
   * inside the same `@media (hover:hover)` block — so the hover that actually rendered
   * was `color-mix(in oklab, var(--sel-bg) 50%, transparent)`. Half-transparent, over a
   * translucent top bar, which composited back to within a hex step of the resting
   * --control-bg: the pills had no hover fill at all, only a brighter label. The design's
   * #131316 -> #1a1a1e is exactly --control-bg -> --surface-hover, so the tokens were
   * right the whole time and never reached the element.
   *
   * So the invariant is mechanical rather than a list of three classes to remember: for
   * every MODIFIER SET ghost uses to set a background, PILL must set a background under
   * the same set. A future `shadcn add` that introduces a fourth (`data-pressed:`, say)
   * fails here instead of quietly repainting the bar. */
  const btn = read('../frontend/src/components/primitives/button.jsx');
  const gen = read('../frontend/src/components/ui/button.jsx');

  assert.match(btn, /chrome: 'ghost'/, 'chrome maps to ghost — that is why ghost is read here');

  const ghost = gen.match(/ghost:\s*\n?\s*"([^"]+)"/);
  assert.ok(ghost, 'the generated ghost variant is readable');
  const pill = btn.match(/const PILL = \[([\s\S]*?)\]\.join/);
  assert.ok(pill, 'PILL is readable');

  // The modifier prefix on every background class in each string — "hover:", the empty
  // string for an unmodified one, and so on.
  const bgSets = (s) => new Set(
    [...s.matchAll(/(?:^|[\s'])((?:[\w[\]().,/-]+:)*)bg-[^\s']+/g)].map((m) => m[1]),
  );
  const ghostSets = bgSets(ghost[1]);
  const pillSets = bgSets(pill[1]);
  assert.ok(ghostSets.size >= 3,
    'ghost is expected to set a background under several modifier sets — if not, re-read this test');
  for (const set of ghostSets) {
    assert.ok(pillSets.has(set),
      `ghost sets a background under \`${set}\` and PILL does not — tailwind-merge cannot `
      + 'drop it, so it will paint the top bar\'s pills instead of the design\'s tokens');
  }

  // And the values, which are the design's own two steps rather than any convenient pair:
  // #131316 -> #1a1a1e resting to hover, then #1c1c21 while the popover is open.
  assert.match(pill[1], /bg-\[var\(--control-bg\)\]/, 'resting surface');
  assert.match(pill[1], /hover:bg-\[var\(--surface-hover\)\]/, 'the design\'s hover fill');
  assert.match(pill[1], /dark:hover:bg-\[var\(--surface-hover\)\]/,
    '`dark` is `&` in this app, so ghost\'s dark hover must be answered, not inherited');
  assert.match(pill[1], /aria-expanded:bg-\[var\(--sel-bg\)\]/, 'an open control says so');
  // The one that is about direction rather than colour: without it, hovering an OPEN
  // control takes it back down from --sel-bg to --surface-hover, which is §14 in reverse.
  assert.match(pill[1], /aria-expanded:hover:bg-\[var\(--sel-bg\)\]/,
    'an open control must not dim under the pointer — DESIGN-LANGUAGE §14');
});
