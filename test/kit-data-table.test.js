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

test('§14 — every hover treatment has a keyboard twin, and it is :focus-visible', () => {
  /* DERIVED, NOT LISTED. §14: "a row styled for :hover alone is interactive for the mouse
   * and inert for the keyboard. Use group-hover PLUS group-focus-within." The shipped
   * table fails it where it matters most — the selection box is revealed by `tr:hover`
   * and by the box's OWN `:focus-visible`, so tabbing through a row's links reveals
   * nothing at all.
   *
   * ── AND §14's OWN SPELLING IS WRONG FOR A CLICKABLE AFFORDANCE (owner, 2026-09-09) ──
   *
   * The first version used `group-focus-within`, which is what §14 says and which broke
   * the interaction the owner then found: tick a box, untick it, move the pointer away,
   * and the box stays visible for the rest of the session — one row wearing a hover state
   * nobody is hovering.
   *
   * A MOUSE CLICK LEAVES FOCUS BEHIND, and `:focus-within` matches focus from any source.
   * `:focus-visible` is the browser's own answer to precisely this question: it matches
   * only when focus arrived in a way that wants a focus ring, which is the keyboard. So
   * the twin `group-has-[:focus-visible]` satisfies what §14 is FOR — a keyboard user
   * sees the affordance — without the failure the literal wording produces.
   *
   * THIS TEST ACCEPTS EITHER FORM, deliberately. `:focus-within` is right for something
   * that cannot be clicked (a row that reveals a read-only marker), and wrong for
   * anything that can. Which one a component needs is a judgement; that it has ONE is
   * not, and that is what this asserts. §14 needs the sentence — flagged to the owner
   * with the §1 and §10 amendments. */
  const TWIN = ['group-focus-within:', 'group-has-[:focus-visible]:'];
  const hovers = [...code.matchAll(/group-hover:([a-z0-9[\]()\-_,%./]+)/g)].map((m) => m[1]);
  assert.ok(hovers.length > 0, 'expected the table to use group-hover at all');

  const orphans = hovers.filter((h) => !TWIN.some((t) => code.includes(t + h)));
  assert.deepEqual(
    orphans, [],
    `these hover treatments have no keyboard twin — a keyboard user never sees them:\n  ${
      orphans.map((o) => `group-hover:${o}`).join('\n  ')}`,
  );

  /* AND THE CLICKABLE ONES MUST BE ON `:focus-visible`. The selection box is the case that
   * broke; naming it means a future edit back to `:focus-within` fails here rather than
   * being found by the owner again. */
  const select = code.slice(code.indexOf('function DataTableSelect'), code.indexOf('function DataTableStack'));
  assert.ok(
    select.includes('group-has-[:focus-visible]:opacity-100'),
    'the selection box must reveal on :focus-visible, not :focus-within — a mouse click '
      + 'leaves focus behind, so :focus-within strands the box visible after an untick',
  );
  assert.ok(
    !select.includes('group-focus-within'),
    'DataTableSelect is back on :focus-within, which strands the box visible after a '
      + 'click. See the note in the component.',
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
  /* THREE, since the footer landed: the real cell, the skeleton cell, and a total's row.
   * All three are the same 37px on purpose — a footer that is a different height from the
   * rows it sums reads as a separate table stuck underneath. */
  const heights = code.match(/h-\[37px\]/g) || [];
  assert.equal(
    heights.length, 3,
    'the real cell, the skeleton cell and the footer cell must all be 37px — found '
      + `${heights.length} declarations of that height.`,
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

test('the indeterminate dash lives in ONE place, and it is not this file', () => {
  /* REWRITTEN TWICE IN ONE DAY, and both rewrites are worth recording because they are
   * the same mistake from opposite directions.
   *
   * V1 pinned the dash INSIDE data-table.jsx and called the gap a registry finding. That
   * was true of @shadcn and false of the registry — @coss ships the state — so the test
   * was enforcing a hand-built thing, which is a test that keeps it. Same shape as the
   * stale assertion Batch 3 found (it forbade the info and success tones months after
   * their tokens existed); a stale test is worse than a stale comment because it enforces.
   *
   * V2 pinned it to the GENERATED file, on the assumption we would stay on coss. The owner
   * chose the shadcn checkbox instead — a coss component arrives in our colours but in
   * coss's geometry, and there were twenty-one coss literals on it against eight tokens
   * that resolved through our bridge. So shadcn genuinely has no indeterminate state and
   * we genuinely need one.
   *
   * WHAT IS ACTUALLY INVARIANT, and is all this should ever have asserted: the dash is
   * drawn in exactly ONE place — `checkbox.jsx`, the wrapper seam — and the table only
   * passes the flag down. Two components drawing it is how they come to disagree. */
  assert.doesNotMatch(
    code, /data-\[indeterminate\]/,
    'data-table.jsx is drawing an indeterminate state again. That belongs in '
      + 'primitives/checkbox.jsx, so every tick box in the app gets it — pass '
      + '`indeterminate` through and let the checkbox draw it.',
  );
  assert.match(
    code, /indeterminate=\{indeterminate\}/,
    'the select-all must still pass `indeterminate` down, or a partial selection draws '
      + 'a TICK and lies about what the bulk action will do',
  );
  const box = readFileSync(at('../frontend/src/components/primitives/checkbox.jsx'), 'utf8');
  assert.match(
    box, /data-\[indeterminate\]:before:/,
    'primitives/checkbox.jsx must draw the indeterminate dash. @shadcn/checkbox has no '
      + 'such state — it renders a tick whatever is selected. If the registry ever ships '
      + 'it, delete the wrapper block AND this assertion together.',
  );
  assert.match(
    box, /data-\[indeterminate\]:bg-primary/,
    'indeterminate must also FILL: Base UI omits data-checked while indeterminate, so the '
      + 'generated fill rules never fire and the box would read as empty',
  );
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

test('the arrival flash lives in the bridge, is tokened, and does not fill forwards', () => {
  /* THE BEHAVIOUR ALREADY SHIPPED and the owner approved keeping it (2026-09-09), so this
   * pins the three things the REBUILD could get wrong. All three are silent failures.
   *
   * NO `forwards`. The keyframe ends on `background-color: transparent`. If the animation
   * filled forwards, that transparent would stick and the row's hover and selected fills
   * would stop painting for the rest of the session — on the one row the trader most
   * wants to click. Nothing would error.
   *
   * NOT `--tint-*`. The legacy rule reached into that family, which is fenced off for
   * legacy only and dies with app.css. A rebuild that kept the token would have to be
   * redone the day that file goes.
   *
   * IN bridge.css, NOT legacy/app.css. `@keyframes` are global and layer-free, so the
   * only thing that matters is which file survives — and app.css is frozen anyway
   * (legacy-frozen.test.js would refuse a new name in it). */
  const bridge = readFileSync(at('../frontend/src/styles/bridge.css'), 'utf8');
  assert.match(bridge, /@keyframes pv-row-flash/, 'the arrival keyframe belongs in bridge.css');
  assert.match(bridge, /background-color: var\(--profit-bg\)/, 'it must use --profit-bg, not a legacy --tint-*');
  assert.doesNotMatch(
    bridge.slice(bridge.indexOf('@keyframes pv-row-flash')).slice(0, 200), /--tint-/,
    'the arrival keyframe must not reach into the legacy --tint-* family',
  );
  assert.match(code, /animate-\[pv-row-flash_2s_var\(--ease\)\]/, 'the row plays it at 2s on the token curve');
  assert.doesNotMatch(
    code, /pv-row-flash[^']*forwards/,
    'the flash must NOT fill forwards — it ends on transparent, which would then stick '
      + "and permanently kill that row's hover and selected fills",
  );
  assert.match(
    legacyCss, /\.row-flash/,
    'the shipped .row-flash rule is still in app.css. It goes when the Trade Log migrates '
      + 'in Cycle 01, together with its name in test/fixtures/legacy-classes.txt.',
  );
});

test('the Trade Log preview shows the columns the Trade Log shows, and no more', () => {
  /* DERIVED FROM `tradeColumns.js`, so it cannot rot. The owner's first look at the
   * preview was a table scrolling sideways, because it rendered FIFTEEN columns — the
   * thirteen defaults plus SL Size and Rules, which I had switched on to show the missing
   * value and the hover reason. Thirteen fits the page and fifteen does not, so the
   * "as it will be seen in the Trade Log" pane was showing something the page never does.
   *
   * The extra two went to the parity pane, and on 2026-09-09 the parity pane itself was
   * deleted — so the file now defines the thirteen and nothing else. This asserts the
   * split rather than a count: whatever `tradeColumns.js` marks `defaultOn` is what the
   * preview renders. */
  const spec = readFileSync(at('../frontend/src/features/trades/tradeColumns.js'), 'utf8');
  const preview = readFileSync(at('../frontend/src/features/dev/KitDataTable.jsx'), 'utf8');

  // Every column the shipped spec turns on by default, minus the structural select box.
  const defaults = [...spec.matchAll(/\{ id: '([a-z_]+)',[^}]*defaultOn: true[^}]*\}/g)]
    .map((m) => m[1])
    .filter((id) => id !== 'select');
  assert.ok(defaults.length >= 10, `expected the shipped default view, found ${defaults.length}`);

  // The preview's own COLUMNS array — the one TradeLogPreview renders.
  const block = preview.slice(preview.indexOf('const COLUMNS = ['), preview.indexOf('const SELECT_W'));
  const shown = [...block.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]);

  const optional = ['sl', 'adherence', 'duration', 'mfe', 'maxr', 'commission'];
  const strays = shown.filter((id) => optional.includes(id));
  assert.deepEqual(
    strays, [],
    'the Trade Log preview renders an OPTIONAL column: ' + strays.join(', ') + '. This '
      + 'file defines the thirteen the page ships and nothing else — fifteen columns '
      + 'overflow the page and thirteen do not.',
  );
  assert.equal(
    shown.length, defaults.length,
    `the preview shows ${shown.length} columns and the shipped default view has `
      + `${defaults.length}. They must match, or the pane is not the Trade Log.`,
  );
});

test('a table in a card rounds its own corners — clipping would kill the sticky header', () => {
  /* THE TRAP, AND IT WAS SPRUNG. A table in a card has square corners against the card's
   * rounded ones, and the obvious fix is `overflow: hidden` on the card. That makes the
   * card a SCROLL CONTAINER, a sticky child sticks to its nearest scroll container, and
   * `top: var(--topbar-h)` stops meaning "below the top bar" and starts meaning "50px
   * below the top of this card". The owner's first look had the header floating over the
   * second row.
   *
   * Same CSS fact as the `scroll` prop's, reached from the other direction — which is how
   * it got past me twice in one component. The shipped page already solved it and says so
   * in one line: "Rounding moves onto the outer cells, since the panel no longer clips."
   *
   * AND THE CORNERS ARE SQUARE, which is a separate decision (owner, 2026-09-09). They
   * were briefly rounded — 24px meeting a card's border, 18px inset one step per §6 trap
   * 3 — and the owner chose straight. Inset in a padded PanelCard the table never meets
   * the card's curve, so the radius was answering a question the layout had closed.
   *
   * The two rules are pinned together because they LOOK related and are not: square
   * corners are a preference that may change; not clipping is a mechanism that must not.
   * If the corners come back, they go on the outer CELLS and never on a clip. */
  assert.doesNotMatch(
    code, /rounded-(?:tl|tr|bl|br)-/,
    'the table corners are square (owner, 2026-09-09). If that is being reversed, round '
      + 'the outer CELLS — never clip the card.',
  );
  assert.match(
    code, /\[&_tbody_tr:last-child_td\]:border-b-0/,
    'the last row drops its hairline always — below the final row there is nothing to '
      + 'divide, so it is a rule to nowhere',
  );
  assert.doesNotMatch(
    code, /overflow-hidden/,
    'data-table.jsx must never clip its own overflow: any non-visible overflow makes it a '
      + 'scroll container and the sticky header then pins inside the box instead of under '
      + 'the top bar.',
  );
});

test('a table can total itself, and the footer is not the registry as it ships', () => {
  /* ADDED 2026-09-09 for the summary specimen. A trade log has no total — the KPI row
   * above already carries one and §24 forbids saying it twice — but a cost-and-return
   * breakdown exists FOR what its rows add up to.
   *
   * TWO OF THE REGISTRY'S THREE FOOTER CLASSES ARE WRONG HERE, both for reasons already
   * recorded on the row: `bg-muted` resolves to `--chrome-hover`, the same token a HOVERED
   * row uses, so a footer would read as permanently hovered; and `border-t` is
   * `--color-border`, a card's edge. The rule above a total is `--line-strong` — §4 names
   * it "THE standard visible border — dashed empties, SEPARATORS" — because it separates
   * the sum from what it sums rather than one row from the next. */
  assert.match(code, /function DataTableFooter/, 'the footer must exist');
  assert.match(code, /border-t-\[var\(--line-strong\)\]/, 'the rule above a total is --line-strong');
  const foot = code.slice(code.indexOf('function DataTableFooter'), code.indexOf('const ROW_TONE'));
  assert.ok(!foot.includes('bg-muted'), 'bg-muted is the HOVER token — a footer would read as hovered');
  assert.match(barrel, /DataTableFooter/, 'and it must be exported from the barrel');
});

test('the Trade Log preview is the approved card, not dev scaffolding', () => {
  /* OWNER, 2026-09-09: "I like this type of fit better" — the review panes, which are a
   * card with a titled head and their content inset, against the bare flush panel the
   * preview had. So the preview moved onto `PanelCard` + `PanelHead`, which are APPROVED
   * primitives visible on the locked dashboard.
   *
   * That is the difference between the Trade Log looking cut from the dashboard and
   * looking approximately like it, and it is why this is worth pinning: the specimen
   * cards below are inline-styled scaffolding that never ships, and it would be easy to
   * reach for one here by habit. */
  const preview = readFileSync(at('../frontend/src/features/dev/KitDataTable.jsx'), 'utf8');
  /* Sliced to the NEXT export rather than to a named comment: this file gained two more
   * specimens between the two markers the first version used, and the slice silently
   * grew to span all three. A boundary that moves when a neighbour is added is a test
   * that stops asserting what it says it asserts. */
  const from = preview.indexOf('export function TradeLogPreview');
  const to = preview.indexOf('export function', from + 10);
  const fn = preview.slice(from, to === -1 ? undefined : to);
  assert.ok(fn.includes('<PanelCard>'), 'the Trade Log preview must use the approved PanelCard');
  assert.ok(fn.includes('<PanelHead'), 'and its head, which is where the title and the count live');
  assert.ok(
    !fn.includes('F.card') && !fn.includes('F.logPanel'),
    'the preview must not use the review scaffolding — that is inline-styled dev chrome '
      + 'and never ships',
  );
});

test('§24 — the P&L cell colours its figure and does not fill its surface', () => {
  /* THE OWNER SAID REMOVE IT, and the reasons survive the instruction. The shipped table
   * paints `.cell-win { background: var(--win-bg) }`, so a winning row carries the fact
   * three times: a green "Win" badge, a green figure, and a green block behind the
   * figure. §24: "two identical facts teach the reader that neither is worth reading."
   * It was also the loudest thing in the table without being the most important — a
   * column of filled blocks reads before the numbers inside them.
   *
   * Same correction §17 already made on the alert, whose surface wash came off every tone
   * on 2026-09-08 for the same complaint. The figure keeps full-strength colour. */
  const tone = code.slice(code.indexOf('const CELL_TONE = {'), code.indexOf('function DataTableCell'));
  assert.ok(tone.length > 20, 'could not find CELL_TONE');
  assert.doesNotMatch(
    tone, /bg-/,
    'a P&L cell must not fill its background — the badge and the figure already carry the '
      + 'outcome, and a third statement of it is what §24 forbids',
  );
  // Plain string containment, not a built regex. Three assertions in this suite have now
  // been written with `new RegExp` over a template literal and silently matched nothing —
  // the escapes do not survive the trip. `includes` cannot fail open.
  for (const t of ['--profit', '--loss', '--be']) {
    assert.ok(tone.includes(`text-[var(${t})]`), `${t} must still colour the figure`);
  }
});

test('columns are sized to their content, through ONE declaration', () => {
  /* EVERY COLUMN WAS THE SAME WIDTH until the owner asked (2026-09-09). `table-fixed`
   * splits evenly unless told otherwise, so "Type" — holding the word "Sell" — had as
   * much room as "Setup", holding "Break & Retest", which truncated to "Break & Retes".
   * The shipped table has the same fault for the same recorded reason: even widths stop
   * one column claiming the table, which the old Comments column once did.
   *
   * That trade was never necessary. Fixed layout is exactly the mode that lets a column
   * be given a width safely — content still cannot exceed its allotment, which is the
   * protection that was wanted.
   *
   * A `<colgroup>`, NOT A WIDTH PER CELL, and that is the whole point: the header and the
   * body then read the SAME declaration. Widths on cells are two declarations that must
   * agree, and this component has already shipped one head/body disagreement — the
   * selection column's alignment, where a class silently compiled to nothing. */
  assert.match(code, /<colgroup>/, 'widths are declared once, in a colgroup');
  assert.match(
    code, /style=\{\{ width: `\$\{w\}px` \}\}/,
    'a per-column width is an inline style — it cannot be a utility, and a class written '
      + 'by the caller would compile to nothing anyway (§1)',
  );
  assert.match(
    code, /widths\.reduce/,
    'with widths given, the scroll floor is their SUM rather than a per-column guess',
  );

  /* AND EVERY COLUMN IN THE SPEC CARRIES ONE. A missing width makes the colgroup emit
   * `width: undefinedpx` and the floor NaN — both silent. */
  const preview = readFileSync(at('../frontend/src/features/dev/KitDataTable.jsx'), 'utf8');
  const spec = preview.slice(preview.indexOf('const COLUMNS = ['), preview.indexOf('const WITH_OPTIONAL'));
  const ids = [...spec.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]);
  const withWidth = [...spec.matchAll(/id: '([a-z_]+)', width: \d+/g)].map((m) => m[1]);
  assert.deepEqual(
    ids.filter((id) => !withWidth.includes(id)), [],
    'every column must declare a width, or the colgroup emits `undefinedpx` and the '
      + 'minimum width is NaN — both silent',
  );
});

test('a column heading resolves its alignment from the SAME values as its column', () => {
  /* ── THIS TEST PASSED WHILE THE THING IT NAMED WAS NOT HAPPENING ─────────────────────
   *
   * It used to be "a column heading is centred whatever its column does" and it asserted
   * that the string `gutter(narrow, align, 'center')` appeared in the source. It did
   * appear. It also did nothing: `align` had a DEFAULT PARAMETER of `'left'` two lines
   * above, so the `'center'` fallback was unreachable and every header rendered left —
   * which was neither the old rule nor the new one. The owner found it in a screenshot.
   *
   * A TEST THAT READS SOURCE INSTEAD OF BEHAVIOUR AGREES WITH WHATEVER YOU WROTE. That is
   * the third time today this suite has been the thing at fault rather than the component
   * (a `\\b` that was a backspace, a regex whose escapes collapsed, and now this), and it
   * is worth the paragraph: a lint-style test's only real failure mode is passing.
   *
   * ── WHAT IS ACTUALLY INVARIANT ───────────────────────────────────────────────────────
   *
   * The header follows its column (owner, 2026-09-09) — Net P&L right because its figures
   * are, Entry centred because its figures are, text left. So the invariant is not a
   * DIRECTION, which has now changed twice; it is that ONE function resolves it and both
   * cells call it. A header and its column computing alignment separately is the same
   * class of bug as computing WIDTH separately, which is why widths went into a colgroup.
   *
   * So this exercises the resolver on real inputs rather than grepping for a call. */
  const mod = readFileSync(at('../frontend/src/components/primitives/data-table.jsx'), 'utf8');
  const body = mod.slice(mod.indexOf('const resolveAlign'), mod.indexOf('const gutter'));
  // eslint-disable-next-line no-new-func
  const resolveAlign = new Function(`${body} return resolveAlign;`)();

  assert.equal(resolveAlign(undefined, false, false), 'left', 'a text column reads left');
  assert.equal(resolveAlign(undefined, true, false), 'center', 'a measurement reads centred');
  assert.equal(resolveAlign('right', true, false), 'right', 'a RESULT opts into right');
  assert.equal(resolveAlign('left', true, true), 'center', 'narrow wins outright — one box, one answer');

  /* AND BOTH CELLS CALL IT. If either computes its own, they drift the first time one is
   * touched — which is exactly how the selection column ended up with a header and a body
   * that disagreed. */
  const headSrc = mod.slice(mod.indexOf('function DataTableHeadCell'), mod.indexOf('function DataTableBody'));
  const cellSrc = mod.slice(mod.indexOf('function DataTableCell'), mod.indexOf('function DataTableSelect'));
  assert.ok(headSrc.includes('resolveAlign('), 'the HEAD cell must resolve through the shared helper');
  assert.ok(cellSrc.includes('resolveAlign('), 'and so must the BODY cell, or the two drift');
  assert.ok(
    !/const a = align \|\| \(numeric/.test(mod),
    'a cell is resolving alignment inline again instead of calling resolveAlign',
  );

  /* THE SORT BUTTON IS A FLEX CONTAINER and needs `justify-*`; `text-*` on the <th> does
   * nothing to its children. Forgetting that is half of why every header looked left. */
  const head = mod.slice(mod.indexOf('function DataTableHeadCell'), mod.indexOf('function DataTableBody'));
  assert.ok(head.includes('JUSTIFY[a]'), 'the sort button must justify from the same resolved value');
});

test('the specimen hands the header the same two values as the body cell', () => {
  /* The resolver above guarantees ONE answer; this guarantees both cells ask it the same
   * QUESTION. Handing the header `align` alone while the body gets `align` + `numeric`
   * would resolve a measurement's header to left and its figures to centre, and the two
   * would be out by half a column with nothing failing. */
  const preview = readFileSync(at('../frontend/src/features/dev/KitDataTable.jsx'), 'utf8');
  const headJsx = preview.slice(preview.indexOf('<DataTableHeadCell'), preview.indexOf('{c.label}'));
  assert.ok(headJsx.includes('align={c.align}'), 'the header must take the column\'s align');
  assert.ok(headJsx.includes('numeric={c.numeric}'), 'and its numeric, or a measurement drifts');
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
