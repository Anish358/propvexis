import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/platform/paths.js';
import { appCss } from './helpers/app-css.js';
import { readSrc } from './helpers/src-files.js';

/* THE ACCOUNT SWITCHER — the one control that changes what every figure on the page
 * MEANS, rather than how it is written or which rows feed it.
 *
 * IT WAS MISSING ITS PHASES, AND NOT BECAUSE NOBODY WROTE THEM. FilterBar has always
 * rendered a scope summary ("P1 · P2 · Funded") and a phase badge on every menu row,
 * and `.acct-switch-sub` has always styled the hairline that divides the summary from
 * the scope label. All of it read `a.phase` — which listAccounts never returned, so
 * every one of those branches silently rendered nothing for months. The switcher said
 * how many accounts were in scope without saying what kind, which is the one thing a
 * multi-account trader checks before reading any figure on the page.
 *
 * So the fix is a column, not markup, and this test guards the seam between the two.
 */

// The backend half of this seam — readSrc only reaches frontend/src.
const accounts = readFileSync(path.join(repoRoot, 'src/domain/accounts/accounts.js'), 'utf8');
const filterBar = readSrc('features/filters/FilterBar.jsx');
const button = readSrc('components/primitives/button.jsx');

test('listAccounts returns the phase the switcher reads', () => {
  assert.match(accounts, /ch\.phase,/, 'the account list must carry a phase');
  // The LATEST challenge row, not the ACTIVE one: an account whose phase has passed has
  // no active row at all, and "Phase 1, passed" is still the phase that account is.
  assert.match(accounts, /LEFT JOIN LATERAL[\s\S]*?FROM challenges c[\s\S]*?ORDER BY c\.start_date DESC, c\.id DESC[\s\S]*?LIMIT 1/);
  // A LEFT join, so a live-capital account with no challenge is null rather than absent.
  assert.match(accounts, /\) ch ON TRUE/);
});

test('the phase vocabulary is the same on both sides of the wire', () => {
  // The DB writes 'p1' | 'p2' | 'p3' | 'funded'; the switcher maps exactly those.
  const tag = /const PHASE_TAG = \{([^}]*)\}/.exec(filterBar);
  assert.ok(tag, 'PHASE_TAG is gone — the summary has nothing to map with');
  for (const phase of ['p1', 'p2', 'p3', 'funded']) {
    assert.ok(tag[1].includes(`${phase}:`), `PHASE_TAG is missing ${phase}`);
  }
});

test('the summary is a SET of phases, not one per account', () => {
  /* Two Phase 1 accounts and a Phase 2 read "P1 · P2", not "P1 · P1 · P2" — a summary
   * that repeats a phase once per account is a summary that changes length when an
   * account is added, and it is answering "how many" a second time when the label
   * beside it already did. Deduped through a Set and ordered by lifecycle, so it reads
   * the same however the account list happens to be sorted. */
  assert.match(filterBar, /new Set\(list\.map\(\(a\) => PHASE_TAG\[a\.phase\] \|\| a\.phase\)/);
  assert.match(filterBar, /PHASE_ORDER\.filter\(\(t\) => tags\.has\(t\)\)/);
  const order = /const PHASE_ORDER = \[([^\]]*)\]/.exec(filterBar);
  assert.ok(order, 'the lifecycle order is gone — the summary would follow the account list');
  assert.deepEqual(
    order[1].replace(/['\s]/g, '').split(','),
    ['P1', 'P2', 'P3', 'Funded'],
  );
});

test('the divider is a RULE, not a separator character', () => {
  // Both halves use `·` internally, so a `·` between them would merge two lists into
  // one. A border-left says "these are two different facts" without adding a glyph.
  assert.match(appCss, /\.acct-switch-sub\s*\{[^}]*border-left:\s*1px solid var\(--line-strong\)/);
  assert.match(appCss, /\.acct-switch-sub\s*\{[^}]*padding-left:\s*9px/);
  assert.match(appCss, /\.acct-switch-sub\s*\{[^}]*font-size:\s*11\.5px/);
});

test('the phases drop before the scope label does', () => {
  // §22: never truncate a label to nothing while the detail beside it keeps full width.
  assert.match(appCss, /@media \(max-width: 1200px\)\s*\{\s*\.acct-switch-sub \{ display: none; \}/);
});

test('the switcher sits one step above its neighbours, and hovers one more', () => {
  /* It resolved to the generated `secondary` variant — --sel-bg (#1c1c21), hovering by
   * mixing 5% foreground in (~#232327). That is three steps above the Filters button
   * beside it, where the design draws one, and a hover that lands in chip territory. */
  const tinted = /const TINTED = \[([\s\S]*?)\]\.join/.exec(button);
  assert.ok(tinted, 'the tinted surface is gone — it would fall back to the preset again');
  assert.match(tinted[1], /bg-\[var\(--control-bg-strong\)\]/, 'rest is the filled-quiet-button surface');
  assert.match(tinted[1], /hover:bg-\[var\(--surface-hover\)\]/, "hover is the standard control hover");
  assert.match(tinted[1], /border-\[var\(--line-strong\)\]/, 'the edge is #26262b, as the design draws it');
  assert.match(tinted[1], /font-\[550\]/, 'its label is a value, so it sits a half-step up');
  // §14: hover INTENSIFIES what the control already wears — a filled control brightens
  // its fill, and must not gain a hue it did not have at rest.
  assert.ok(!/hover:[^\s']*accent|hover:[^\s']*brand/.test(tinted[1]),
    'hover must not introduce brand colour to a neutral control');
});
