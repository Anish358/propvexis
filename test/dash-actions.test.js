import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { appCss } from './helpers/app-css.js';
// Guards the dashboard action strip (Sync Trades / Customize layout). Its whole
// point is to be chrome-free and to sit in a fixed slot in the page order, so
// those are the two things worth pinning down.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = appCss;
const dash = read('../frontend/src/features/dashboard/Dashboard.jsx');

test('the strip sits between Today\'s Brief and the KPI row', () => {
  /* MARKUP ORDER AGAIN (2026-08-30). The page order was data — a stored, reorderable
   * list of sections — so this used to assert the default arrangement instead of the
   * source. Customization is gone and the arrangement is the JSX, so the source order
   * IS the page order and can be read directly. */
  const body = dash.slice(dash.indexOf('page-body dash-page-body'));
  const at = (needle) => {
    const i = body.indexOf(needle);
    assert.notEqual(i, -1, `${needle} is not on the page`);
    return i;
  };
  assert.ok(at('<DailyBanner') < at('<DashActions'), "Today's Brief leads the page");
  assert.ok(at('<DashActions') < at('<KpiRow'), 'the strip sits above the KPI row');
  assert.ok(at('<KpiRow') < at('dash-main-grid'), 'the content grid comes last');
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
  /* NOT PRIMARY SINCE RHEA (it was `primary`, a light fill). The primary act on this
   * page is READING it: a white button at the top of a dashboard pulls the eye to a
   * control most traders touch once a session, and the design draws it as a quiet
   * FILLED pill.
   *
   * `tinted` SINCE 2026-08-30, not `secondary`. The design draws this button on the
   * same surface as the account switcher, and tokens.css names it explicitly on
   * --control-bg-strong ("a FILLED quiet button — Sync Trades, This month, Import").
   * `secondary` + `pill` resolved to --control-bg, the TOP BAR's resting surface, so it
   * sat a step darker than the design and read as chrome rather than as an action.
   *
   * The rule this test protects — no raw <button> in a page, the strip's controls are
   * primitives so their focus ring and hit area match the rest of the chrome — is
   * unchanged. */
  assert.match(block, /<Button\b[\s\S]*variant="tinted"/, 'Sync Trades is the filled quiet button, not a chrome pill');
  assert.doesNotMatch(block, /<button\b/, 'no raw <button> in the strip');
  assert.match(block, /<ActionStatus/, 'the strip still reports sync state');
  /* ONE CONTROL. "Customize layout" sat at the far end and opened the layout editor;
   * both went on 2026-08-30, and ActionLink — which existed for that control alone —
   * went with them. A second quiet control at the far end is what made this strip read
   * as two sentences rather than an action and its status. */
  assert.doesNotMatch(block, /<ActionLink/, 'the strip is an action and a status, nothing else');
  assert.doesNotMatch(block, /Customize/, 'customize layout is gone until every page is finalised');
});

test('the sync status is the design\'s label with a TRUE value in it', () => {
  /* WHAT THIS USED TO PIN: that "Last synced: 2 min ago" — the design's copy, shipped as
   * a static string — was absent, because an elapsed time with nothing behind it is a
   * number a trader will act on ("it synced two minutes ago, so this P&L is current")
   * when nothing has run. It asserted the honest placeholder instead.
   *
   * THAT DAY HAS ARRIVED, which this test anticipated in as many words: "stops being a
   * guess the day a real feed lands without the label changing at all". GET
   * /api/sync/status now answers it, and the value comes from the SYNC JOBS.
   *
   * The interim source — the newest trade's close_time — was wrong in both directions
   * and is gone: a successful sync that found nothing new left the line reading "never",
   * and an account whose last trade closed on Friday reported Friday as the sync time.
   * Those are different facts and only one of them is called "last synced".
   *
   * So this pins what still matters: the label is the design's, the value is COMPUTED
   * rather than a literal, and it is derived from sync jobs rather than from trades. */
  const code = stripComments(dash);
  const block = code.slice(code.indexOf('function DashActions'), code.indexOf('Section 2'));
  assert.match(block, /Last synced: \$\{lastSynced \|\| 'never'\}/, "the label is the design's");
  assert.doesNotMatch(code, /['"`]\s*\d+ min ago\s*['"`]/, 'no hardcoded elapsed time anywhere');
  // Derived from the data, not from a constant...
  assert.match(code, /const lastSynced = useMemo\(/);
  assert.match(code, /Date\.now\(\) - newest/);
  // ...and from the SYNC FEED, not from the trade list.
  assert.match(code, /for \(const j of syncJobs\)/,
    'last synced must read sync jobs; trades are a different fact');
  assert.match(code, /fetchSyncStatus\(\)/);
});

test('the Sync Trades button actually syncs', () => {
  /* IT WAS NEVER WIRED. The button rendered, looked right, and did nothing at all —
   * no onClick, no handler, no request. A control that cannot fail is
   * indistinguishable from one that silently does. */
  const code = stripComments(dash);
  const block = code.slice(code.indexOf('function DashActions'), code.indexOf('Section 2'));
  assert.match(block, /onClick=\{onSync\}/, 'the button must have a handler');
  assert.match(block, /disabled=\{syncing\}/, 'and must not be pressable twice while in flight');
  assert.match(code, /syncNow\(\)/, 'and that handler must call the sync endpoint');
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

test('Clear on a brief alert actually removes the row', async () => {
  /* IT DID NOT, AND NOTHING WAS BROKEN UNDERNEATH. The alert list read
   * `!n.read_at || n.severity !== 'info'` — keep it if unread, OR if it is anything
   * more serious than info. Clear marks the alert read, and for every warning and
   * critical row (which is every row worth clearing) the second half of that predicate
   * is still true afterwards, so the row stayed exactly where it was.
   *
   * The unread count dropped and the server really did mark it read. It simply did
   * nothing a user could see, which is the same thing as being broken. A control named
   * Clear has to clear. */
  const { readSrc } = await import('./helpers/src-files.js');
  const src = readSrc('features/dashboard/Dashboard.jsx');
  const filter = /const alerts = notifications\.filter\(\(n\) => ([^)]*)\)/.exec(src);
  assert.ok(filter, 'the brief no longer filters its alerts — Clear has nothing to act on');
  assert.equal(filter[1].trim(), '!n.read_at',
    'a read alert must leave the brief, or Clear does nothing visible');
  // Clear is still the same act as the notification panel's, against the same route —
  // not local component state, which would return on reload and disagree with the badge.
  assert.match(src, /onClear=\{markNotificationRead \? \(\) => markNotificationRead\(n\.id\) : undefined\}/);
});
