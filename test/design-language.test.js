import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appCss, tokensCss, legacyCss, bridgeCss } from './helpers/app-css.js';

// DESIGN-LANGUAGE §6 (radius assignment), §7 (elevation ladder) and §14 (hover model)
// were locked on 2026-08-05, closing three of the DLS's open TODOs.
//
// The DLS's own enforcement clause is the reason this file exists: "Documentation states
// intent; tests prevent regression. A DLS rule with no test is a rule that will erode."
// Each test below names the rule it guards so a failure sends you to the section rather
// than to a guess.
const css = appCss;

// ── §7 Elevation ─────────────────────────────────────────────────────────────

test('§7 — no component writes an elevation shadow; only the ladder does', () => {
  // The mechanical test the DLS states: an elevation shadow has a blur radius or a
  // y-offset. A focus ring (`0 0 0 Npx`) has neither and is §9's business, not §7's.
  // Eight one-off shadows were retired into --sh-1/2/3 when this rule landed; this is
  // what stops a ninth appearing, which no reviewer would catch by eye.
  // The ONE documented exception, listed by name in §7: an edge-attached drawer casts
  // along its edge, and the ladder has no directional variant. Allowlisting it by value
  // keeps it a known exception rather than something a looser test waves through.
  const EDGE_ATTACHED = '-12px 0 40px var(--shadow-50)';   // .tp-panel — see §7

  const offenders = [];
  for (const decl of legacyCss.match(/box-shadow:[^;}]*/g) || []) {
    const value = decl.replace(/box-shadow:\s*/, '').trim();
    if (/var\(--sh-[123]\)/.test(value)) continue;         // on the ladder
    if (/^none/.test(value) || /inset/.test(value)) continue;
    if (value === EDGE_ATTACHED) continue;
    // Elevation = offset in SOME direction AND a blur. A focus ring has no blur; a dot
    // glow has blur but no offset. Both are other sections' business (§9, §4).
    for (const layer of value.split(/,(?![^(]*\))/)) {
      const [x, y, blur] = layer.trim().split(/\s+/);
      const px = (v) => parseFloat(v) || 0;
      if (px(blur) !== 0 && (px(x) !== 0 || px(y) !== 0)) offenders.push(layer.trim());
    }
  }
  assert.deepEqual(offenders, [],
    'these cast a shadow without using --sh-1/2/3 — see DESIGN-LANGUAGE §7');
});

test('§7 — the ladder is three levels, defined once', () => {
  /* ONCE, NOT TWICE, SINCE 2026-08-28. This asserted each shadow was declared twice —
   * on :root and again under [data-theme="light"] — because a level defined only for
   * dark would fall back to a dark shadow on a white surface. There is no light theme
   * any more (tokens.css, "NO LIGHT THEME"), so a second declaration would be a value
   * nothing reads. The ladder itself is unchanged: three levels, all present. */
  for (const t of ['--sh-1', '--sh-2', '--sh-3']) {
    const hits = (tokensCss.match(new RegExp(`${t}:`, 'g')) || []).length;
    assert.equal(hits, 1, `${t} must be defined exactly once, found ${hits}`);
  }
});

test('§7 — a surface that blocks the page is level 3; one that does not is level 2', () => {
  // The discriminator is blocking, not anchoring. `.dle-panel` has a `.dle-backdrop`, so
  // it takes over the screen and keeps --sh-3; the filter panel and the menus leave the
  // page usable behind them and sit at --sh-2.
  const level = (sel) => {
    const start = css.indexOf(`${sel} {`);
    assert.ok(start !== -1, `rule ${sel} exists`);
    const body = css.slice(start, css.indexOf('}', start));
    const m = body.match(/box-shadow:\s*var\(--sh-([123])\)/);
    return m && m[1];
  };
  assert.match(legacyCss, /\.dle-backdrop \{/, '.dle-panel is only level 3 because it has a backdrop');
  assert.equal(level('.dle-panel'), '3', 'a blocking panel is level 3');
  for (const sel of ['.fp', '.fp-menu', '.bulk-menu', '.bs-pop']) {
    assert.equal(level(sel), '2', `${sel} leaves the page live, so it is level 2`);
  }
  assert.equal(level('.panel'), '1', 'a card rests on the page');
});

// ── §6 Radius ────────────────────────────────────────────────────────────────

test('§6 — the radius scale matches the preset, and the card is the one exception', () => {
  // The legacy overlays below still take --r-2xl. They are LEGACY rules on their way out
  // (§1: delete, never patch); what governs generated components is the bridge mapping
  // asserted further down.
  const overlays = [
    '.fp', '.fp-menu',
    '.bulk-menu', '.bs-pop', '.wcz-menu', '.explain-pop', '.toast',
    /* `.modal` LEFT THIS LIST 2026-09-07 — the rule is deleted, not relaxed. The shell
       owns its surface in `modal.jsx` now, and §6 gives a dialog its own 24px step (the
       value `ui/dialog.jsx` asks for). Asserted below against the shell instead. */
    '.rp-modal', '.dle-panel',
    // `.onb-card` left this list with the rule, when the first-run onboarding screen
    // became the Add Account wizard. Nothing replaces it, and that is not the rule
    // being relaxed: the wizard is a full-bleed PAGE, not a floating surface, so §6's
    // overlay assignment simply does not apply to it. Its own surfaces — the choice
    // cards — take --r-2xl through components/primitives/wizard.jsx, where §6 is cited
    // and tailwind-merge resolves it.
  ];
  for (const sel of overlays) {
    const start = css.indexOf(`${sel} {`);
    assert.ok(start !== -1, `rule ${sel} exists`);
    const body = css.slice(start, css.indexOf('}', start));
    assert.match(body, /border-radius:\s*var\(--r-2xl\)/,
      `${sel} must use var(--r-2xl) — see DESIGN-LANGUAGE §6`);
  }
  // `.tb-user-menu`, `.acct-menu` and `.notif-panel` left this list on 2026-08-05 — none
  // declares a radius any more, because the generated dropdown-menu and popover do. The
  // rule is unchanged and still enforced, one level up: the bridge is what guarantees the
  // preset's radius names land on OUR scale rather than Tailwind's. If a mapping breaks,
  // a preset-skinned overlay silently leaves the scale, which is invisible in review.
  //
  // `3xl` is the one that proves the test is worth having: the generated popover asks for
  // `rounded-3xl`, our scale stops at 2xl, and the mapping was MISSING — so the
  // notification feed would have rendered at Tailwind's 24px beside menus at 13px.
  /* THE SCALE IS THE PRESET'S, AND THE CARD IS THE ONE EXCEPTION (§6 amended
   * 2026-09-07, owner). `2xl`, `3xl` and `4xl` were all aliased onto `--r-2xl` (14px,
   * our card radius), which collapsed three distinct steps into one — so controls,
   * popovers and dialogs every one of them rendered at a card's roundness.
   *
   * What this test protects has not changed: a preset radius name must resolve to a
   * value WE chose, never to whatever Tailwind happens to default to. It now checks
   * that we chose the preset's, which is the same guarantee pointed at a new answer. */
  const PRESET_RADIUS = { xl: '14px', '2xl': '16px', '3xl': '24px', '4xl': '32px' };
  for (const [step, value] of Object.entries(PRESET_RADIUS)) {
    assert.match(bridgeCss, new RegExp(`--radius-${step}:\\s*${value}`),
      `the preset's rounded-${step} is ${value} — see DESIGN-LANGUAGE §6`);
  }
  /* And the exception, pinned where a deviation belongs. The generated card asks for
   * `min(--radius-4xl, 24px)` = 24px; ours stays 14. It is in the WRAPPER rather than
   * the bridge because dialog.jsx and alert-dialog.jsx read the same token — capping it
   * would have dragged every dialog down to a card's roundness. */
  const cardPrim = readFileSync(
    new URL('../frontend/src/components/primitives/card.jsx', import.meta.url), 'utf8',
  );
  assert.match(cardPrim, /rounded-\[var\(--r-2xl\)\]/,
    'the card keeps our 14px radius — the single documented deviation from the preset');
});

test('§6 — a dialog takes its own 24px step, not the overlay radius', () => {
  /* Amended 2026-09-07 (owner): every other floating surface keeps --r-2xl, but a
   * dialog is much larger and reads as under-rounded at 14px. 24px is what the
   * generated `ui/dialog.jsx` asks for, so the component matches the preview it was
   * chosen from. The shell carries it because `.modal` no longer exists in CSS. */
  const shell = readFileSync(
    new URL('../frontend/src/components/primitives/modal.jsx', import.meta.url), 'utf8',
  );
  assert.match(shell, /rounded-\[24px\]/,
    'the dialog shell must carry the 24px step — see DESIGN-LANGUAGE §6');
  assert.ok(!/\.modal \{/.test(css),
    '.modal must stay deleted from legacy CSS — the shell owns its surface');
});

test('§6 — the assignment rule is documented where it is enforced, on the Rhea scale', () => {
  /* WHAT THIS USED TO PIN: the string "Cards -> --r-2xl" in tokens.css, because the
   * assignment-by-surface rule had lived only as a comment beside the values and a rule
   * nobody can find is a rule nobody follows (~110 literal radii accumulated against it).
   *
   * The rule is unchanged; the SCALE moved (§6/§22, 2026-08-29 — the preset's rem steps
   * became Rhea's 5/6/10/12/14/99px). So this now pins the two things that would
   * actually break a page rather than one comment's wording: that every step of the
   * scale is declared, and that the card step is documented as belonging to cards. */
  assert.match(tokensCss, /CARDS and floating overlays/,
    'tokens.css must still say which surface --r-2xl is for');
  /* sm and md moved 5->6 and 6->8 (§6 amended 2026-09-07, owner): they take preset
   * b2qLMFPP6's derived steps so a registry component arrives shaped right. The others
   * did not move because they were ALREADY the preset's values — --r-lg 10px and
   * --r-2xl 14px match it exactly, which nobody had noticed. */
  const RHEA = { '--r-sm': '6px', '--r-md': '8px', '--r-lg': '10px', '--r-input': '10px', '--r-xl': '12px', '--r-2xl': '14px', '--r-full': '99px' };
  for (const [name, value] of Object.entries(RHEA)) {
    assert.match(tokensCss, new RegExp(`(?<![\\w-])${name}\\s*:\\s*${value}\\b`),
      `${name} must be ${value} on the Rhea scale — see DESIGN-LANGUAGE §6`);
  }
});

// ── §14 Hover ────────────────────────────────────────────────────────────────

test('§14 — hover never introduces a colour family the element did not have', () => {
  // The locked rule: hover intensifies what the element already wears, so a hover to a
  // brand fill is only legal on a control that is ALREADY brand-filled. Checking the
  // hover value alone is not enough — `.auth-submit` goes --accent-strong -> --accent,
  // which looks like a brand hover and is entirely compliant. The resting rule is what
  // decides it, so that is what this reads.
  //
  // This is also the shape the --accent collision would have taken: had the bridge
  // mapped shadcn's "accent" (a hover surface) onto our brand blue, every neutral
  // control in the app would fail exactly this assertion.
  const isBrand = (v) => /var\(--accent|var\(--blue-/.test(v);
  // "Already brand" means the FILL or the EDGE is brand — a brand-bordered control on a
  // transparent background is as much part of the family as a filled one, and filling it
  // on hover is the intensification §14 describes. `.cal-today-btn` is the live example:
  // transparent + --accent-border at rest, --accent-bg on hover.
  const restsBrand = (body) => {
    const m = body.match(/(?:^|[\s;])(?:background|border(?:-color)?):\s*([^;}]*)/g) || [];
    return m.some((d) => isBrand(d));
  };
  const offenders = [];
  for (const m of legacyCss.matchAll(/(\.[a-z0-9-]+(?:[.:][a-z0-9-()]+)*):hover[^{]*\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    const bg = body.match(/background:\s*([^;}]*)/);
    if (!bg || !isBrand(bg[1])) continue;
    const base = selector.split(':')[0];
    const start = legacyCss.indexOf(`${base} {`);
    const restBody = start === -1 ? '' : legacyCss.slice(start, legacyCss.indexOf('}', start));
    if (!restsBrand(restBody)) offenders.push(`${base} hovers to ${bg[1].trim()}`);
  }
  assert.deepEqual(offenders, [],
    'a non-brand control hovers to a brand fill — see DESIGN-LANGUAGE §14');
});

test('§14 — a hover treatment on a menu row has a keyboard twin', () => {
  // Base UI marks the arrow-key-focused item with [data-highlighted]. A menu row styled
  // for :hover alone is interactive for the mouse and inert for the keyboard, which
  // fails §14 from the other direction.
  //
  // The `rows.size >= 3` floor was removed on 2026-08-05, and its removal is the point
  // rather than a weakening: the three rows it counted were `.tb-menu-item`,
  // `.tb-menu-item.danger` and `.acct-opt`, and all three are now DELETED because the
  // generated dropdown-menu owns item styling. It styles `focus:`, which Base UI sets
  // for pointer and keyboard alike, so the twin can no longer be forgotten — the class
  // of bug this floor guarded against is gone from the menus entirely. Asserting a
  // count would now require re-adding legacy rules to satisfy a test.
  //
  // What remains, and still matters: ANY legacy row that keeps a highlight must keep
  // its hover, and vice versa. The loop below enforces the pairing for however many
  // exist — today the account-scope rows in the sidebar, tomorrow whatever is added.
  const rows = new Set();
  for (const m of legacyCss.matchAll(/(\.[a-z0-9-]+(?:\.[a-z0-9-]+)*)\[data-highlighted\]/g)) rows.add(m[1]);
  // And the requirement's new home: the generated item must style focus, not hover only.
  const dd = readFileSync(
    new URL('../frontend/src/components/ui/dropdown-menu.jsx', import.meta.url),
    'utf8',
  );
  assert.match(dd, /focus:bg-accent/,
    'the generated menu item must carry a focus background — that is what replaced the twins');
  for (const sel of rows) {
    const esc = sel.replace(/\./g, '\\.');
    assert.match(legacyCss, new RegExp(`${esc}:hover`),
      `${sel} has a keyboard highlight but no hover — the pair must move together`);
  }
});

// ── §8 Dividers ──────────────────────────────────────────────────────────────

test('§8 — a divider is full-width and never inset', () => {
  /* Closed 2026-09-07 by adopting the preset's answer, which the generated components
   * already drew: `Separator` is `h-px w-full bg-border`, and the menu separator is
   * `-mx-1 my-1 h-px bg-border/50` — a NEGATIVE margin, so it goes full-bleed across a
   * padded panel instead of stopping at the padding.
   *
   * The primitive is a bare re-export precisely because there was nothing to correct;
   * this asserts the generated component still draws the rule, since a `shadcn add`
   * could change it and the re-export would pass the change through silently. */
  const gen = (f) => readFileSync(
    new URL(`../frontend/src/components/ui/${f}`, import.meta.url), 'utf8',
  );
  assert.match(gen('separator.jsx'), /h-px/, 'a divider is 1px');
  assert.match(gen('separator.jsx'), /w-full/, 'and spans its container — never inset');
  assert.match(gen('dropdown-menu.jsx'), /-mx-1 my-1 h-px/,
    'inside a padded panel a divider goes full-bleed, not to the padding');

  /* And the half-strength half of the rule. The menu separator cannot use `bg-border/50`
   * as generated — `border` is `--line`, an edge tuned to a #111114 CARD, invisible on a
   * #18181b panel even at full strength. The wrapper keeps the STRUCTURE (the surface's
   * own edge, halved) with the panel's edge instead. */
  /* The wrapper needs NO override for this any more. `--color-border` is contextual, so
   * the generated `bg-border/50` is already "half the current surface's edge" — a card's
   * inside a card, a panel's inside a panel. What has to hold is that a floating panel
   * declares the context; without it the divider silently falls back to a card's edge. */
  const menu = readFileSync(
    new URL('../frontend/src/components/primitives/menu.jsx', import.meta.url), 'utf8',
  );
  assert.match(menu, /data-overlay-surface/,
    'a menu panel must declare the overlay context, or its divider uses a card edge');
});
