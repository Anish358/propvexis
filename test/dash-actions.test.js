import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultDashLayout } from '../frontend/src/features/dashboard/dashLayout.js';

import { appCss } from './helpers/app-css.js';
// Guards the dashboard action strip (Sync Trades / Customize layout). Its whole
// point is to be chrome-free and to sit in a fixed slot in the page order, so
// those are the two things worth pinning down.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = appCss;
const dash = read('../frontend/src/features/dashboard/Dashboard.jsx');

test('out of the box, the strip sits between Today\'s Brief and the KPI row', () => {
  // Page order is now data, not markup order (see dash-layout.test.js), so this
  // asserts the default arrangement rather than the source order: brief first,
  // KPI row next, and the strip rendered in between the two.
  const sections = defaultDashLayout().sections;
  assert.equal(sections.indexOf('brief'), 0, 'Today\'s Brief should lead the default layout');
  assert.equal(sections.indexOf('kpis'), 1, 'the KPI row should follow it');
  assert.match(dash, /stripAfter === id && <DashActions/, 'strip must render after its anchor row');
  assert.match(dash, /stripAfter = isDashVisible\(layout, 'brief'\) \? 'brief'/, 'the anchor should be the brief');
});

test('the action strip is the shared Button plus strip primitives, never a raw button', () => {
  /* THREE THINGS CHANGED WITH THE 2026-08-28 REBUILD and one did not.
   *
   * Sync Trades is `primary` now, not `secondary`: it is the only action on the page
   * and the frame fills it. Primary is a LIGHT fill since this redesign (see
   * token-bridge.test.js), not the brand blue it used to be.
   *
   * `.dash-actions-status` is gone with the rest of the legacy classes, and the copy it
   * held has changed on purpose — see the test below.
   *
   * What did not change is the rule this test exists for: no raw <button> in a page.
   * The strip's own quiet control is a primitive (ActionLink) so its focus ring, hover
   * and hit area match every other chrome control instead of being re-derived here. */
  const block = dash.slice(dash.indexOf('function DashActions'), dash.indexOf('// ---- Section 2'));
  /* SECONDARY SINCE RHEA (was `primary`, a light fill). The primary act on this page is
   * READING it: a white button at the top of a dashboard pulls the eye to a control most
   * traders touch once a session, and the design draws it as a quiet bordered pill. The
   * rule this test protects — no raw <button> in a page, the strip's controls are
   * primitives so their focus ring and hit area match the rest of the chrome — is
   * unchanged. */
  assert.match(block, /<Button\b[\s\S]*variant="secondary"/, 'Sync Trades is a quiet pill, not the page\'s primary action');
  assert.doesNotMatch(block, /<button\b/, 'no raw <button> in the strip');
  assert.match(block, /<ActionLink/);
  assert.match(block, /<ActionStatus/, 'the strip still reports sync state');
});

test('the sync status is the design\'s label with a TRUE value in it', () => {
  /* WHAT THIS USED TO PIN: that "Last synced: 2 min ago" — the design's copy, shipped as
   * a static string — was absent, because an elapsed time with nothing behind it is a
   * number a trader will act on ("it synced two minutes ago, so this P&L is current")
   * when nothing has run. It asserted the honest placeholder instead.
   *
   * The design's LABEL is right and it is back; what was wrong was the hardcoded value.
   * There is still no sync-status endpoint, but the newest ingested trade IS evidence
   * that a sync happened and when — so the figure is derived, says "never" with no
   * trades, and stops being a guess the day a real feed lands without the label
   * changing at all.
   *
   * So this now pins the thing that actually matters: the value is COMPUTED, never a
   * literal. */
  const code = stripComments(dash);
  const block = code.slice(code.indexOf('function DashActions'), code.indexOf('Section 2'));
  assert.match(block, /Last synced: \{lastSynced \|\| 'never'\}/, "the label is the design's");
  assert.doesNotMatch(code, /['"`]\s*\d+ min ago\s*['"`]/, 'no hardcoded elapsed time anywhere');
  // And it is derived from the data, not from a constant.
  assert.match(code, /const lastSynced = useMemo\(/);
  assert.match(code, /Date\.now\(\) - newest/);
});

test('Today\'s Brief banner has a titled head with a settings control', () => {
  /* REWRITTEN FOR THE 2026-08-28 FIGMA REBUILD. The `.dash-banner-*` markup this pinned
   * is gone — the card is composed from Brief* primitives now — so the class-name
   * assertions could only have gone on passing against legacy CSS that nothing wears.
   * What they were protecting survives verbatim and is what is asserted here: the card
   * has a real heading, the settings control carries a visible name rather than being a
   * bare icon, and the head comes before the content it titles. */
  const block = dash.slice(dash.indexOf('function DailyBanner'), dash.indexOf('// Dashboard-level actions'));
  assert.match(block, /<BriefHeader/);
  assert.match(block, /title="Today's Brief"/);
  // Was icon-only and needed an aria-label; the frame gives it a text label instead,
  // which is strictly better — the name is visible to everyone, not just a screen reader.
  // Icon-only since 2026-08-28, so the name is an attribute rather than a child.
  assert.match(block, /<BriefAction[\s\S]*?aria-label="Brief settings"/);
  assert.match(block, /aria-expanded=\{settingsOpen\}/);
  // Head must precede the events/alerts content it titles.
  assert.ok(block.indexOf('<BriefHeader') < block.indexOf('<BriefColumns'));
  // The title is Rhea's 18.5/650/-0.25, declared once in the primitive. WAS 15/600 on
  // the intermediate Figma pass, where the card opened with an amber icon tile that
  // carried some of the weight; Rhea drops the tile and lets the words be the heading.
  const brief = readSrc('components/primitives/brief.jsx');
  assert.match(brief, /text-\[18\.5px\] leading-7 font-\[650\] tracking-\[-0\.25px\]/);
});

test('action strip carries no container chrome', () => {
  // Everything from `.dash-actions {` up to the next top-level rule — a
  // background, border, divider or shadow here would turn the strip into the
  // card/toolbar it is explicitly not meant to be.
  const start = css.indexOf('.dash-actions {');
  assert.ok(start > -1, 'missing .dash-actions rule');
  const rule = css.slice(start, css.indexOf('}', start));
  for (const prop of ['background', 'border', 'box-shadow']) {
    assert.doesNotMatch(rule, new RegExp(`\\b${prop}`), `.dash-actions should not set ${prop}`);
  }
  // Status text is subtle-but-readable, not --muted (which reads as disabled).
  assert.match(css, /\.dash-actions-status \{[^}]*color: var\(--text-2\)/);
});
