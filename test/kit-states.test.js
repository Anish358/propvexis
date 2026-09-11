import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legacyCss } from './helpers/app-css.js';

/* THE KIT'S THREE STATES — Cycle 00, piece 6. The last one.
 *
 * IT OWES ALMOST NO NEW APPEARANCE, and that is the finding rather than a shortcut.
 * EmptyState and LoadingBlock (Batch 6), Skeleton and Alert (Batch 3) are all approved,
 * and the data table drew its own three states correctly in piece 1 — real rows at the
 * real height, `aria-busy`, a label naming what is loading. §15 is locked and already
 * says which state appears when.
 *
 * What was actually missing is COVERAGE: **two route-level pages out of seventy-four
 * render anything at all when a fetch fails**, and the one that does breaks §17 twice.
 * So the piece is one new part, `ErrorState`, plus a recorded question about how far
 * `LoadingBlock` can honour §15's fidelity rule without re-opening a locked component.
 *
 * WHAT IS DELIBERATELY NOT HERE. How it LOOKS is the owner's, on the Test page.
 */

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(at(p), 'utf8');

const errorState = read('../frontend/src/components/primitives/error-state.jsx');
const emptyState = read('../frontend/src/components/primitives/empty-state.jsx');
const dataTable = read('../frontend/src/components/primitives/data-table.jsx');
const barrel = read('../frontend/src/components/primitives/index.js');
const kit = read('../frontend/src/features/dev/KitStates.jsx');
const dls = read('../docs/design/DESIGN-LANGUAGE.md');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = strip(errorState);
const kitCode = strip(kit);

test('the error state is a sibling of the empty state, on the same shell', () => {
  /* §15: "an empty state is not an error state". They share an ANATOMY on purpose — the
   * same generated `Empty` — so the two are structurally identical by construction
   * rather than by anyone remembering to keep them so. What must differ is the read. */
  assert.match(
    code, /from '@\/components\/ui\/empty'/,
    'the error state is no longer built on the generated Empty. It and EmptyState are '
      + 'the same block with three deliberate differences; a second shell means they can '
      + 'drift apart in every other respect.',
  );
  assert.match(
    emptyState, /from '@\/components\/ui\/empty'/,
    'EmptyState moved off the generated Empty, so the two states no longer share a shell.',
  );
});

test('§15 — the empty state is DASHED and the error state is not', () => {
  /* The first of the three differences, and the one doing most of the work at a glance.
   * A dashed outline is the idiom for a space waiting to be filled: right for "no trades
   * yet", wrong for "this failed". A failure is not a placeholder. */
  assert.match(
    emptyState, /border-dashed/,
    'the empty state lost its dashed edge, which is what separates it from the error '
      + 'state at a glance.',
  );
  assert.doesNotMatch(
    code, /border-dashed/,
    'the error state has taken a dashed edge. That is the empty state\'s idiom — a space '
      + 'waiting to be filled — and §15 says the two must not read alike.',
  );
});

test('§17 — colour is on the GLYPH and the EDGE, and on no word', () => {
  /* THE RULE THE THING IT REPLACES BREAKS TWICE.
   *
   *     .banner.error { background: var(--tint-loss-7); color: var(--loss); … }
   *
   * §17 permits the glyph and a border, forbids colouring the body text, and caps a
   * surface wash at 4% — that is a 7% tint AND coloured words. The second half is the
   * one that matters most in this product: red is the trader's money, so a screen washed
   * in loss-red to report a timeout speaks the language of a losing day about a network
   * problem. */
  assert.match(
    code, /text-\[var\(--warning-bright\)\]/,
    'the error glyph is no longer toned. §17 spends colour here on purpose: an error the '
      + 'user does not notice is a worse failure than one they briefly misread.',
  );
  assert.match(
    code, /--warning\)_20%/,
    'the edge no longer carries the tone at 20% — the value the owner tuned the alert '
      + 'tones down to on 09-08, when four side by side read "too colorful".',
  );
  /* No fill. `Empty`'s own surface is whatever it sits on; a tone wash here would be the
   * banner's mistake repeated. */
  assert.doesNotMatch(
    code, /\bbg-(destructive|warning|loss|red)/,
    'the error state is washing its surface with a tone. §17 caps that at 4% and this '
      + 'component has no business spending it — the glyph and the edge already carry '
      + 'the message.',
  );
  /* And the loss colour specifically must not appear: inside this app red is money. */
  assert.doesNotMatch(
    code, /--loss/,
    'the error state is using the LOSS colour. Inside this product red and green are the '
      + 'trader\'s money (§17\'s "data surface" exclusion) — a failed fetch is not a '
      + 'losing day. Warning is the tone for "the system has something to tell you".',
  );
});

test('the error state offers a way out, and demotes the raw server string', () => {
  /* The third difference. An empty state SUGGESTS something to do ("Add your first
   * trade"); an error asks for another go at something the user did nothing wrong in.
   *
   * And the detail line: what ships is `Could not load stats: {err}` — one line in which
   * a raw server message carries the same weight as the explanation. Kept because it is
   * what makes a bug report useful; demoted because it is never what the reader needs
   * first. */
  assert.match(code, /onRetry/, 'the error state no longer offers a retry');
  assert.match(
    code, /detail/,
    'the technical detail slot is gone. The raw message is what makes a bug report '
      + 'useful — it belongs in the component, below the sentence, not merged into it.',
  );
  assert.match(
    code, /font-mono text-xs text-\[var\(--text-3\)\]/,
    'the detail line is no longer quieter than the sentence. That ordering IS the fix to '
      + '`Could not load stats: {err}`.',
  );
});

test('ErrorState replaces content; Alert sits on top of it — and the table proves it', () => {
  /* The line between the two, drawn in the same place the data table already drew it:
   * an Alert is a message ON content, an ErrorState replaces content that is not there.
   * `DataTableNotice` puts an Alert in a full-span cell so the table keeps its header
   * and width — "a state that replaces the whole table is a layout jump wearing a
   * state's clothes". If that ever changes, these two components have stopped agreeing. */
  assert.match(
    dataTable, /DataTableNotice/,
    'the data table no longer has its in-table notice row, so the ErrorState/Alert '
      + 'boundary this file documents no longer has a worked example.',
  );
  assert.doesNotMatch(
    code, /from '\.\/alert\.jsx'/,
    'the error state is wrapping Alert. They are different objects: Alert is a message '
      + 'ON a working screen, this replaces a screen that has no content.',
  );
});

test('the coverage finding is real — the app still has almost no error states', () => {
  /* THE REASON THIS PIECE EXISTS, ASSERTED SO IT CANNOT QUIETLY BECOME UNTRUE OR STALE.
   *
   * Two route-level pages out of seventy-four render anything when a load fails. If that
   * number moves — either because screens gained error states or because the count of
   * pages changed a lot — the specimen's figures are wrong and should be re-derived
   * rather than left as decoration. */
  const featureDir = at('../frontend/src/features');
  const pages = [];
  for (const area of readdirSync(featureDir, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    for (const f of readdirSync(`${featureDir}/${area.name}`)) {
      if (/^[A-Z].*\.jsx$/.test(f)) pages.push(`${featureDir}/${area.name}/${f}`);
    }
  }
  assert.ok(pages.length > 60, `expected ~74 route-level pages, found ${pages.length}`);
  const handled = pages.filter((p) => /if \((?:err|error)\)/.test(readFileSync(p, 'utf8')));
  assert.ok(
    handled.length <= 4,
    `${handled.length} pages now render something on a failed load, up from 2. That is `
      + 'good — but the specimen quotes "2 of 74", and a figure on the review page that '
      + 'has drifted is worse than no figure. Re-derive it.',
  );
});

test('the §17 offender is still standing, and still the thing to delete', () => {
  assert.match(
    legacyCss, /\.banner\.error\s*\{/,
    'the `.banner.error` rule is gone. If Analytics was migrated, good — the rule and its '
      + 'name in test/fixtures/legacy-classes.txt are deleted in the SAME commit, and '
      + 'this test moves with them.',
  );
  assert.match(
    legacyCss, /\.banner\.error[^}]*color:\s*var\(--loss\)/,
    'the banner no longer colours its words in loss-red. If that was fixed in place, it '
      + 'is the wrong fix — the standing rule is to delete legacy and replace it with the '
      + 'primitive, never to patch the rule.',
  );
});

test('§15 is the source, and it still says what this piece was built against', () => {
  /* Three tests above encode §15's wording. A test that encodes a decision moves with
   * the decision or it enforces a stale one — this file has already watched
   * kit-tooltip.test.js reverse two assertions for that reason. */
  assert.match(dls, /## §15 States — 🔒 LOCKED/, '§15 is no longer locked, or was renamed');
  assert.match(
    dls, /An empty state is not an error state/,
    '§15 no longer separates empty from error, which is the premise of this whole piece.',
  );
  assert.match(
    dls, /real card shells, at the real dimensions/,
    '§15 no longer demands real-shell skeletons — which is the rule LoadingBlock is '
      + 'measured against on the Test page.',
  );
});

test('ErrorState is exported from the barrel, because that is the only door', () => {
  assert.match(
    barrel, /\bErrorState\b/,
    'ErrorState is not exported. Seventy-two screens have no error state at all; an '
      + 'unexported one is a part nobody can reach.',
  );
});

test('the specimen shows empty and error TOGETHER, which is the only way to judge them', () => {
  assert.ok(
    kitCode.includes('<EmptyState') && kitCode.includes('<ErrorState'),
    'the specimen no longer renders both states. §15\'s claim is that they must not read '
      + 'alike, and that can only be judged side by side.',
  );
});
