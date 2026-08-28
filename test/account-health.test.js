import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc, stripComments } from './helpers/src-files.js';

/* ACCOUNT HEALTH, pinned against the 2026-08-28 Figma frame (node 1:2).
 *
 * This is the card that tells a trader their account is about to be closed, so the
 * assertions here lean on the RULES rather than the pixels: which states draw colour,
 * which direction the bar fills, and whether colour is ever the only carrier of a
 * warning. A number drifting two pixels is a cosmetic bug; any of these drifting is a
 * trader not being told.
 */

const account = readSrc('components/primitives/account.jsx');
const accountCode = stripComments(account);
const details = readSrc('features/prop/AccountDetails.jsx');
const dash = readSrc('features/dashboard/Dashboard.jsx');

test('a healthy meter draws no colour at all', () => {
  /* THE LOAD-BEARING DECISION IN THIS FILE. `good` and `na` map to null, so a quiet
   * meter gets no wash and no tinted border. If a healthy account draws colour, colour
   * stops meaning anything and the warn/bad states lose the only advantage they have —
   * which is that they are the only coloured thing on a calm page.
   *
   * `na` is null for a different reason worth keeping straight: a missing rule is an
   * unknown, not a safe state, and drawing it green would be a claim we cannot make. */
  const tone = accountCode.slice(accountCode.indexOf('const TONE = {'));
  const block = tone.slice(0, tone.indexOf('}'));
  assert.match(block, /good:\s*null/, 'a healthy meter must draw no colour');
  assert.match(block, /na:\s*null/, 'an unknown rule must not be drawn as safe');
  assert.match(block, /warn:\s*'var\(--warning\)'/);
  assert.match(block, /bad:\s*'var\(--loss\)'/);
  // `target` is separate from `good` on purpose: a target's wash is encouragement, not
  // alarm, and collapsing the two would either colour healthy meters or drain the
  // target's.
  assert.match(block, /target:\s*'var\(--profit\)'/);
});

test('escalation is never colour alone', () => {
  /* Three encodings, and the test exists because the first two are easy to keep and the
   * third is easy to lose in a refactor: the wash, the figure's colour, and a GLYPH.
   * The glyph is derived from the tone in AccountDetails rather than passed per meter,
   * so a warn meter is a triangle and a bad one a filled circle everywhere — the moment
   * that becomes a per-call decision, one surface will disagree with another. */
  assert.match(details, /const TONE_ICON = \{/);
  const map = details.slice(details.indexOf('const TONE_ICON = {'));
  const block = map.slice(0, map.indexOf('}'));
  for (const k of ['warn', 'bad']) {
    assert.match(block, new RegExp(`${k}:`), `${k} must carry a glyph, not just a hue`);
  }
  // And the account tabs carry the same guarantee: the dot is the hue, the alert icon
  // is the shape, and a healthy account gets no icon at all (zero emphasis is the point).
  assert.match(dash, /function AccountAlertIcon/);
  assert.match(dash, /if \(status === 'good'\) return null/);
  assert.match(dash, /aria-label=\{label\}/, 'the glyph must name the severity for a reader');
});

test('the bar fills UP as risk grows, and the track is a real surface', () => {
  /* USED/LIMIT, not room-remaining. A room-remaining bar EMPTIES toward danger, so the
   * most alarming state would be the one with the least ink on screen — exactly
   * backwards for the number that ends accounts. Inherited from the pre-redesign meter
   * and not a visual choice to revisit.
   *
   * The track is --surface-2 rather than a tint of the fill: a track washed in the
   * fill's own hue makes an 8%-used meter look half full from across a desk. */
  assert.match(details, /used=\{data\.dailyDd\?\.usedToday\}/);
  assert.match(details, /limit=\{data\.dailyDd\?\.limit\}/);
  assert.match(account, /bg-\[var\(--surface-2\)\]/, 'the meter track must be a surface, not a tint');
  assert.match(account, /width: `\$\{fill\}%`/);
});

test('the day count is printed once', () => {
  // The frame prints it in the header AND the footer. The same seven words twice inside
  // one card teaches the reader that neither is worth reading, so it lives in the
  // footer, beside the link it relates to.
  const card = dash.slice(dash.indexOf('function AccountCard('), dash.indexOf('// ---- page ---'));
  const hits = (card.match(/minimum trading days completed/g) || []).length;
  assert.equal(hits, 1, `the trading-day count appears ${hits} times — it must appear once`);
});

test('the card and its meters reflow inside the 1080-1920 range', () => {
  // Three meters become one column at 1200: a meter holds a 22px figure, its limit, a
  // bar and a footer line, and under ~300px the figure and the limit collide.
  assert.match(account, /grid grid-cols-3 gap-3 max-\[1200px\]:grid-cols-1/);
  // Tabs wrap rather than scroll. A horizontally scrolling strip of accounts hides the
  // account the trader is looking for, which is the one thing this row exists to find.
  assert.match(account, /flex flex-wrap items-center gap-2/);
  // The footer wraps too, so "View account" never overlaps the day count.
  assert.match(account, /flex flex-wrap items-center justify-between gap-3 border-t/);
});

test('the meters stay one component across both surfaces', () => {
  /* Accounts › Details and the Dashboard render the SAME AccountDetails. Two copies of
   * a drawdown meter is two places for a threshold to be wrong in, and only one of them
   * would get fixed. `onSetTarget` is what keeps it portable: the Dashboard owns the
   * target-editing flow and passes it; a surface without that flow passes nothing and
   * gets the same meters without the link. */
  assert.match(dash, /<AccountDetails\s+data=\{data\}/);
  assert.match(details, /export default function AccountDetails\(\{ data, onSetTarget = null \}\)/);
});

test('the account primitives stay presentation only', () => {
  for (const leak of ['roomStatus', 'healthStatus', 'fmtMoney', 'useState', 'useEffect']) {
    assert.ok(!accountCode.includes(leak), `account.jsx must not know about ${leak}`);
  }
});
