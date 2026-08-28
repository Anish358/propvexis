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
  assert.match(block, /<Button\b[\s\S]*variant="primary"/, 'Sync Trades is the page\'s primary action');
  assert.doesNotMatch(block, /<button\b/, 'no raw <button> in the strip');
  assert.match(block, /<ActionLink/);
  assert.match(block, /<ActionStatus/, 'the strip still reports sync state');
});

test('the sync status does not invent a timestamp', () => {
  /* IT USED TO READ "Last synced: 2 min ago" AND IT WAS STATIC COPY. The frame draws a
   * green tick beside the button, but this page has no sync-status feed behind it, so
   * any elapsed time printed here is a number with nothing under it — the kind a trader
   * reasonably acts on ("it synced two minutes ago, so this P&L is current") when in
   * fact nothing has run at all. An honest label costs nothing and does not have to be
   * un-lied about when the feed lands. */
  // stripComments: the note in DashActions explaining what the old copy claimed
  // necessarily quotes it. Fifth scanner in this suite to need this.
  const code = stripComments(dash);
  const block = code.slice(code.indexOf('function DashActions'), code.indexOf('Section 2'));
  assert.doesNotMatch(block, /Last synced/, 'a hardcoded elapsed time is a claim we cannot make');
  assert.match(block, /not yet wired/);
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
  // The title is the frame's 18/28 semibold, declared once in the primitive.
  const brief = readSrc('components/primitives/brief.jsx');
  assert.match(brief, /text-\[16px\] leading-6 font-semibold/);
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
