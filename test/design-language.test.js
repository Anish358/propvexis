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

test('§7 — the ladder is three levels, themed for both modes', () => {
  for (const t of ['--sh-1', '--sh-2', '--sh-3']) {
    // Twice: once on :root (dark) and once under [data-theme="light"]. A level defined
    // only for dark would silently fall back to the dark shadow on a white surface,
    // which is the failure mode §7's dark/light CONTEXT note warns about.
    const hits = (tokensCss.match(new RegExp(`${t}:`, 'g')) || []).length;
    assert.equal(hits, 2, `${t} must be defined for both themes, found ${hits}`);
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

test('§6 — every floating overlay takes the card radius', () => {
  // Decided rather than merely recorded: an overlay is a card that floats, so a menu and
  // the card it opens over never disagree by two or three pixels.
  const overlays = [
    '.fp', '.fp-menu',
    '.bulk-menu', '.bs-pop', '.wcz-menu', '.explain-pop', '.toast',
    '.modal', '.rp-modal', '.onb-card', '.dle-panel',
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
  for (const step of ['2xl', '3xl', '4xl']) {
    assert.match(bridgeCss, new RegExp(`--radius-${step}:\\s*var\\(--r-2xl\\)`),
      `the preset's rounded-${step} must resolve to our card radius — see DESIGN-LANGUAGE §6`);
  }
});

test('§6 — the assignment rule is documented where it is enforced', () => {
  // It lived only as a comment beside the values for months. A rule nobody can find is
  // a rule nobody follows, which is why ~110 literal radii accumulated against it.
  assert.match(tokensCss, /Cards -> --r-2xl/, 'tokens.css keeps the short form');
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
