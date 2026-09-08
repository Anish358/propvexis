import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legacyCss } from './helpers/app-css.js';

/* THE KIT'S DATA TABLE — Cycle 00, piece 1.
 *
 * There was no data table in this codebase; twelve files hand-rolled a `<table>`. This
 * pins the decisions that make the new one ONE table rather than the thirteenth, because
 * every one of them is the kind that gets undone by a later tweak that looks harmless.
 *
 * WHAT IS DELIBERATELY NOT HERE. How it LOOKS is not assertable and is not asserted —
 * that is the owner's, on the Test page, and `primitives-status.test.js` holds the
 * `@design unreviewed` line until they say so. What is here is the set of rules the
 * component would otherwise silently drift out of: a §8 hairline, a §14 keyboard twin,
 * a §1 prop-not-class boundary, and the seam that keeps the table engine out of it.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const src = readFileSync(at('../frontend/src/components/primitives/data-table.jsx'), 'utf8');
const barrel = readFileSync(at('../frontend/src/components/primitives/index.js'), 'utf8');

/* Comments discuss the classes they explain — this file argues about `--line` at length
 * while never drawing it — so every scan below reads code only. Same reason
 * `primitives-status.test.js` strips them. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

test('the data table is the registry component, wrapped — not a thirteenth hand-rolled table', () => {
  assert.match(
    code, /from '@\/components\/ui\/table'/,
    'DESIGN-LANGUAGE §1 step 2: never write your own Table. If this import is gone, the '
      + 'component has been hand-built and the argument for it must be in the file.',
  );
  assert.doesNotMatch(
    code, /['"`][^'"`\n]*\b(?:u-[a-z]|log-grid|grid-wrap|row-check|cell-dt|cell-note)\b/,
    'the kit table renders a legacy class name. It replaces those rules; it does not '
      + 'reuse them (§1: delete legacy, never patch it).',
  );
});

test('no table engine lives in the presentational layer', () => {
  /* THE SEAM, AND WHY IT IS WORTH A TEST. Eleven of the twelve hand-rolled tables in
   * this app are small — Settings, Prop OS, Reports, the strategy comparison — and not
   * one of them needs sorting, faceting or a row model. If TanStack were imported here,
   * adopting the LOOK would mean adopting the ENGINE, and those eleven would keep their
   * own tables forever. The Trade Log drives this component; it does not live in it. */
  assert.doesNotMatch(
    code, /@tanstack/,
    'data-table.jsx must stay presentational. A page composes it with TanStack (or with '
      + 'the plain column spec in tradeColumns.js); the engine does not move in here.',
  );
});

test('§8 — the row hairline is a divider inside a card, not a second card edge', () => {
  /* The shipped table draws `--line` — the card's own edge — four hundred times. §8: "a
   * divider inside a surface that already has an edge is HALF that edge, so it reads as
   * a division rather than a second border. In a card it is `--line-inset`." Batch 5
   * found the identical fault on `separator.jsx` (`bg-border` resolving to a card edge),
   * so this is a repeat offender rather than a hypothetical. */
  assert.match(code, /border-b-\[var\(--line-inset\)\]/, 'the row hairline must be --line-inset');
  const rowRules = code.match(/border-b-\[var\(--line\)\]/g) || [];
  assert.equal(
    rowRules.length, 1,
    'only ONE rule in this table may draw the card edge --line: the header band, which '
      + 'separates two bands rather than two rows. Found ' + rowRules.length + '.',
  );
});

test('§14 — a selected row is not the same colour as a hovered one', () => {
  /* The registry gives both `bg-muted`, and `--color-muted` is one token, so the two
   * were literally identical. Selection is what the bulk-action bar acts on: a trader
   * about to delete nine trades has to be able to see which nine. */
  assert.match(code, /hover:bg-\[var\(--surface-hover\)\]/, 'a row hovers to --surface-hover');
  assert.match(code, /bg-\[var\(--sel-bg\)\]/, 'a selected row takes --sel-bg');
  assert.doesNotMatch(
    code, /bg-muted\b/,
    'bg-muted resolves to the SAME token for hover and for selection here — see §25.',
  );
});

test('§14 — every hover treatment in the table has a keyboard twin', () => {
  /* DERIVED, NOT LISTED. §14: "a row styled for :hover alone is interactive for the
   * mouse and inert for the keyboard. Use group-hover PLUS group-focus-within." The
   * shipped table fails this in the place it matters most — the selection box is
   * revealed by `tr:hover` and by the box's own `:focus-visible`, so TABBING into a row
   * reveals nothing at all. Listing the pairs would rot; this reads them out. */
  const hovers = [...code.matchAll(/group-hover:([a-z0-9[\]()\-_,%./]+)/g)].map((m) => m[1]);
  assert.ok(hovers.length > 0, 'expected the table to use group-hover at all');
  const twins = new Set([...code.matchAll(/group-focus-within:([a-z0-9[\]()\-_,%./]+)/g)].map((m) => m[1]));
  const orphans = hovers.filter((h) => !twins.has(h));
  assert.deepEqual(
    orphans, [],
    'these hover treatments have no keyboard twin — a keyboard user never sees them:\n  '
      + orphans.map((o) => `group-hover:${o}`).join('\n  '),
  );
});

test('§1 — a caller-supplied dimension, alignment or column count is a PROP', () => {
  /* Tailwind compiles utilities only under `components/{ui,primitives}`, so a class
   * written in a page emits NOTHING, silently — and "text-right on a table header,
   * left-aligned header over a right-aligned column" is one of the five entries in §1's
   * own table of times this cost real debugging time. A fifteen-column table is the
   * component most likely to tempt a page into writing one. */
  for (const prop of ['align', 'cols', 'narrow', 'numeric']) {
    assert.match(
      code, new RegExp(`\\b${prop}\\b`),
      `${prop} must be a prop on this component, not something a page writes as a class`,
    );
  }
  assert.match(code, /const ALIGN = \{/, 'alignment resolves through a map inside the library');
});

test('the loading state reserves the real row, not a block where the table will be', () => {
  /* §15: "a skeleton mirrors the page, in the real card shells, AT THE REAL DIMENSIONS.
   * A skeleton that reserves a different shape from its content is the layout jump it
   * exists to prevent." So the cell height is one value shared by the real cell and the
   * skeleton cell — if they can drift, the table twitches when data lands, and nobody
   * will connect that to this file. */
  const heights = code.match(/h-\[37px\]/g) || [];
  assert.equal(
    heights.length, 2,
    'the real cell and the skeleton cell must both be 37px — found ' + heights.length
      + ' declarations of that height.',
  );
  assert.match(code, /aria-busy="true"/, '§15: the loading region says it is busy');
  assert.match(code, /aria-label=\{label\}/, '§15: say WHAT is loading, not just that something is');
  assert.match(code, /rounded-full/, '§15: skeleton lines are pill-shaped');
});

test('§17 — a row state is an edge, never a wash behind the figures', () => {
  /* The shipped table paints an untagged row's whole background `--tint-warn-1`. Two
   * rules say no: `--tint-*` is fenced off for legacy only, and §17 puts a system colour
   * on the glyph and the edge — "never anything inside a data surface: a table cell, a
   * KPI figure, a chart mark. There, red and green are the trader's money."
   *
   * The CELL tones are the exception and are deliberately not caught here: a green P&L
   * cell IS the trader's money, which is the half of §17 that permits it. */
  assert.doesNotMatch(code, /--tint-/, 'the --tint-* family is legacy-only; do not reach for one in new work');
  assert.match(code, /inset_2px_0_0_0_var\(--warning\)/, 'the attention row is marked by an edge');
});

test('the registry checkbox has no indeterminate state, so this file draws one', () => {
  /* A select-all that shows a TICK when nine of four hundred rows are selected is a lie
   * about what the bulk action will do. `ui/checkbox.jsx` hard-renders a CheckIcon and
   * ignores children; Base UI's root does set `data-indeterminate`, so the dash and the
   * fill are absorbed HERE — which is what the barrel's own note prescribes for a gap in
   * the generated layer. If this ever disappears, check the registry actually fixed it. */
  assert.match(code, /data-\[indeterminate\]:before:/, 'the dash is drawn on the indeterminate state');
  assert.match(code, /data-\[indeterminate\]:bg-primary/, 'indeterminate fills like checked — Base UI omits data-checked');
});

test('comparison literals stay OUT of cn(), so the collision test cannot false-positive', () => {
  /* `utility-collisions.test.js` reads every string literal inside a `cn(...)` call as a
   * class list, because that is what they normally are. A `scroll === 'page' ? … : …`
   * written inside the call therefore contributes `page` to the set of utilities this
   * library ships — and `.page` is a real legacy class on eighteen screens. That test
   * failed on exactly this while this component was being built, and its own header
   * names `page` as a false positive it had been fixed for once before. Hoisting the map
   * makes it impossible rather than exempted. */
  const cnBodies = [];
  for (const m of code.matchAll(/\bcn\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < code.length && depth) {
      if (code[i] === '(') depth += 1;
      else if (code[i] === ')') depth -= 1;
      i += 1;
    }
    cnBodies.push(code.slice(start, i - 1));
  }
  assert.ok(cnBodies.length > 0, 'expected the component to use cn()');
  const offenders = cnBodies.filter((b) => /===\s*['"]/.test(b) || /['"]\s*===/.test(b));
  assert.deepEqual(
    offenders.map((o) => o.trim().slice(0, 60)), [],
    'a cn() call compares against a string literal. Hoist the branch into a map above '
      + 'the component — see CONTAINER and JUSTIFY in data-table.jsx.',
  );
});

test('the table is exported from the barrel, because that is the only door', () => {
  const parts = [
    'DataTable', 'DataTableBody', 'DataTableCell', 'DataTableDash', 'DataTableHeadCell',
    'DataTableHeader', 'DataTableNote', 'DataTableNotice', 'DataTableRow',
    'DataTableSelect', 'DataTableSkeleton', 'DataTableStack',
  ];
  for (const p of parts) {
    assert.match(barrel, new RegExp(`(^|[^A-Za-z])${p}([^A-Za-z]|$)`, 'm'), `${p} must be exported`);
  }
});

test('PanelTable stays what it is — the kit table did not absorb it', () => {
  /* Brief §4.1: "PanelTable* in panel.jsx is a 3-column grid for small in-card lists on
   * the Dashboard. It stays exactly as it is. The new data table is a different object,
   * and the design must make the two obviously different so nobody reaches for the wrong
   * one." `panel.jsx` is APPROVED and on the locked dashboard, so this is also the
   * guard against Cycle 00 quietly reopening it. */
  const panel = readFileSync(at('../frontend/src/components/primitives/panel.jsx'), 'utf8');
  assert.match(panel, /@design approved 2026-09-06/, 'panel.jsx stays approved and unmodified in kind');
  assert.doesNotMatch(panel, /data-table/, 'panel.jsx must not depend on the new table');
  assert.doesNotMatch(code, /panel\.jsx|PanelTable/, 'and the new table must not depend on panel.jsx');
});

test('the shipped Trade Log table is still there, because nothing has migrated yet', () => {
  /* CYCLE 00 BUILDS THE KIT; CYCLE 01 MOVES THE TRADE LOG ONTO IT. Deleting
   * `TradesTable.jsx` now would ship a redesign nobody has approved, and the Test page
   * renders it as the review's own baseline. This test is the reminder of the step §9 of
   * the plan says gets skipped: when the Trade Log moves, ITS legacy classes come out of
   * app.css and out of `test/fixtures/legacy-classes.txt` in the same commit — and this
   * assertion is what should fail then, so someone reads that sentence. */
  const shipped = readFileSync(at('../frontend/src/features/trades/TradesTable.jsx'), 'utf8');
  assert.match(shipped, /className="log-grid"|className="grid-wrap"/, 'the shipped table still runs on legacy CSS');
  assert.match(legacyCss, /\.log-grid\b/, 'and its rules are still in app.css — Cycle 01 deletes them');
});
