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
   * The track is a real surface rather than a tint of the fill: a track washed in the
   * fill's own hue makes an 8%-used meter look half full from across a desk. (The token
   * moved --surface-2 -> --surface-hover with Rhea; the requirement did not.) */
  assert.match(details, /used=\{data\.dailyDd\?\.usedToday\}/);
  assert.match(details, /limit=\{data\.dailyDd\?\.limit\}/);
  assert.match(account, /bg-\[var\(--surface-hover\)\]/, 'the meter track must be a surface, not a tint');
  assert.match(account, /width: `\$\{fill\}%`/);
});

test('the risk bar is one stretched ramp, and it never turns green', () => {
  /* THE BAR USED TO BE A FLAT FILL in the tone's single colour — amber at 70%, red at
   * 90%. That teaches the trader the THRESHOLDS rather than the trajectory: a meter at
   * 69% and one at 71% look like two different states rather than one continuum.
   *
   * Rhea fills it with ONE gradient stretched by `background-size` so the visible slice
   * is exactly the first `fill`% of the ramp. Without the stretch the FULL ramp is
   * compressed into the bar's width and every meter ends in red however much room is
   * left — which is worse than a flat fill, not better. That line is the whole
   * mechanism, so it is what gets pinned. */
  assert.match(account, /10000 \/ fill/, 'the ramp must be stretched, not compressed into the bar');
  assert.match(account, /var\(--risk-ramp\)/);
  // And the inverted case opts out of both the ramp and the 90% wall: on a profit
  // target, filling up is progress and 90% is nearly there rather than nearly dead.
  assert.match(account, /INVERTED = new Set\(\['target', 'payout'\]\)/);
  assert.match(account, /inverted \? 'var\(--profit-fill\)' : 'var\(--risk-ramp\)'/);
  assert.match(account, /\{!inverted && \(/, 'the 90% wall is risk-only');
});

test('the day count is printed once', () => {
  // The frame prints it in the header AND the footer. The same seven words twice inside
  // one card teaches the reader that neither is worth reading, so it lives in the
  // footer, beside the link it relates to.
  const card = dash.slice(dash.indexOf('function AccountCard('), dash.indexOf('// ---- page ---'));
  // The COUNT, wherever the words around it land. Rhea splits the sentence so the
  // figure is mono and the qualifier sits after a hairline, so matching the old
  // seven-word string would have pinned the copy rather than the rule.
  /* THE FIGURE IS `days.count` NOW, from tradingDaysRead — one derivation shared with
   * Prop OS and the challenge cards, so the cap at the requirement ("3/3", never "4/3")
   * cannot be applied on one surface and forgotten on another. The rule this test
   * protects is unchanged: the count is printed ONCE. */
  const hits = (card.match(/\{days\.count\}/g) || []).length;
  assert.equal(hits, 1, `the trading-day count appears ${hits} times — it must appear once`);
  assert.equal(/data\.tradingDays\.completed/.test(card), false, 'read through the helper, not raw');
});

test('the card and its meters reflow inside the 1080-1920 range', () => {
  // Three meters become one column at 1200: a meter holds a 22px figure, its limit, a
  // bar and a footer line, and under ~300px the figure and the limit collide.
  assert.match(account, /grid grid-cols-3 gap-4 px-\[18px\] pt-3 pb-5 max-\[1200px\]:grid-cols-1/);
  /* TABS SCROLL RATHER THAN WRAP, WHICH REVERSES THIS TEST (2026-08-29, Rhea).
   *
   * It used to assert wrapping, on the argument that a horizontally scrolling strip
   * hides the very account a trader is looking for. That argument held for a 36px-tall
   * text tab. Rhea's chip is 60 tall and carries a health ring, a name and a phase —
   * wrapping four of those puts a SECOND 60px row above the meters and pushes the
   * numbers that end accounts below the fold, on the one card where that matters most.
   * A scrolled strip keeps the card one height whatever the account count, and the
   * overflow control is still there for finding a specific account. */
  assert.match(account, /flex items-stretch gap-2\.5 overflow-x-auto/);
  // The footer wraps, so "View account" never overlaps the day count.
  assert.match(account, /flex flex-wrap items-center gap-4 border-t/);
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

/* THE CARD OPENS ON ITS ACCOUNTS (2026-08-30) — no heading, and a link that does not
 * outweigh its own words.
 *
 * Both are §24/§23 rules the card broke in the same corner. A "Account Health" title
 * over the account chips is the card narrating itself, and it spent 40px at the top of
 * the one card a trader reads under pressure. The "View account" link carried a 16px
 * icon beside 13px type, which reads as a button that has lost its border. */
test('the account card has no heading of its own', async () => {
  const { readSrc } = await import('./helpers/src-files.js');
  const account = readSrc('components/primitives/account.jsx');
  const dashboard = readSrc('features/dashboard/Dashboard.jsx');
  assert.ok(!/export function AccountCardHead/.test(account),
    'AccountCardHead is back — the design opens this card on the account chips');
  assert.ok(!/<AccountCardHead/.test(dashboard), 'Dashboard renders a heading on the account card');
  // The live card and its skeleton must agree, or the title-shaped gap is a load jump.
  assert.ok(!/Account Health<\/|>Account Health</.test(dashboard),
    'the words are back in the markup');
});

test('the View account arrow is sized to its type, not to a button', async () => {
  const { readSrc } = await import('./helpers/src-files.js');
  const account = readSrc('components/primitives/account.jsx');
  const link = /account-link[\s\S]*?\[&_svg\]:size-(\S+?)'/.exec(account)
    ?? /AccountCardLink[\s\S]*?\[&_svg\]:size-([\d.]+)/.exec(account);
  assert.ok(link, 'the link no longer sizes its icon — it will inherit a full-size glyph');
  assert.equal(link[1], '3.5', 'the arrow must be 14px against the link’s 13px type');
});

test('the meter prints ONE slash between a value and its limit', async () => {
  /* It printed two — "$0 / / $2,500" — because UsageMeter passed a pre-formatted
   * "/ $2,500" into a Meter that draws its own separator. The separator is presentation
   * and belongs to the component that owns the baseline alignment between the two
   * figures; the caller owns the figure. */
  const { readSrc } = await import('./helpers/src-files.js');
  const meter = readSrc('components/primitives/account.jsx');
  const caller = readSrc('features/prop/AccountDetails.jsx');
  // Exactly one place emits the glyph, and it is the primitive.
  assert.match(meter, /\{limit && <span[^>]*>\/ \{limit\}<\/span>\}/);
  assert.ok(!/limit=\{limit == null \? null : `\//.test(caller),
    'the caller is formatting a separator the primitive already draws');
  assert.match(caller, /limit=\{limit == null \? null : money\(limit\)\}/);
});
