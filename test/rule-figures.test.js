import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxDdUsed, targetProgress } from '../frontend/src/features/prop/ruleFigures.js';
import { readSrc, stripComments } from './helpers/src-files.js';

/* THE RULE METERS NEVER SHOW A NEGATIVE. 2026-09-03.
 *
 * Two figures the prop engine reports as SIGNED distances were being printed as the
 * left half of "used / limit":
 *
 *   an account $2,090 UP read  "-$2,090 / $2,500" on max drawdown
 *   an account $500 DOWN read  "-$500 / $1,200"   on its profit target
 *
 * A minus sign on the meter that ends accounts is the worst kind of wrong number — it
 * is legible, it is on the card a trader checks before deciding whether they can trade,
 * and it says the opposite of what is true. These tests pin the floor and the single
 * place it lives, because the clamp is one `Math.max` and four call sites.
 */

test('max drawdown used is floored at zero for an account in profit', () => {
  // $25k account, $2,500 band, trading $2,090 above baseline: roomLeft is the whole
  // band PLUS the profit, so limit - roomLeft is negative.
  assert.equal(maxDdUsed({ limit: 2500, roomLeft: 4590 }), 0);
  // And it still reports real consumption when the account IS in drawdown — the clamp
  // must not flatten the only figure that warns.
  assert.equal(maxDdUsed({ limit: 1500, roomLeft: 1000 }), 500);
  assert.equal(maxDdUsed({ limit: 2500, roomLeft: 0 }), 2500, 'at the floor the band is fully used');
  // Float noise from the subtraction is rounded, not printed.
  assert.equal(maxDdUsed({ limit: 1250, roomLeft: 749.999999 }), 500);
  // No rule (a manual account) is an absent meter, not a zeroed one.
  assert.equal(maxDdUsed(null), null);
  assert.equal(maxDdUsed({ limit: null, roomLeft: null }), null);
});

test('profit target progress is floored at zero for an account in drawdown', () => {
  assert.equal(targetProgress({ current: -500, target: 1200 }), 0);
  assert.equal(targetProgress({ current: 640, target: 1200 }), 640);
  // Over-target is NOT clamped: passing a phase by more than the target is a fact the
  // trader wants to see, and the meter's own fill is what stops at 100%.
  assert.equal(targetProgress({ current: 2090, target: 2000 }), 2090);
  assert.equal(targetProgress(null), null);
});

test('the clamp lives in one module and every meter surface reads it', () => {
  /* THE POINT OF THE HELPER. Four surfaces draw these meters, and each used to compute
   * `limit - roomLeft` itself. A per-call-site clamp is a clamp one surface will miss. */
  for (const f of [
    'features/prop/AccountDetails.jsx',
    'features/prop/AccountPortfolioCard.jsx',
    'features/prop/ChallengeCard.jsx',
    'features/prop/challengesData.js',
  ]) {
    const src = stripComments(readSrc(f));
    assert.match(src, /from '\.\/ruleFigures\.js'/, `${f} must read the shared figures`);
    assert.match(src, /maxDdUsed\(/, `${f} must not recompute max-DD used`);
    assert.doesNotMatch(src, /limit - \w*\.?\w*[Rr]oomLeft/, `${f} still subtracts roomLeft by hand`);
    assert.match(src, /targetProgress\(/, `${f} must not print a raw target current`);
  }
});

test('a target in progress prints in its own colour, and a risk meter never does', () => {
  /* Green on a profit target is §4 colour for a P&L quantity — which is what a target
   * is. Green on a drawdown meter would congratulate a trader for surviving, so the
   * hue is gated on `inverted` and not on the fill alone. */
  const code = stripComments(readSrc('components/primitives/account.jsx'));
  assert.match(code, /const positive = inverted && fill > 0;/);
  assert.match(
    code,
    /color: critical \? 'var\(--loss-fg\)' : positive \? hue : 'var\(--text\)'/,
    'the figure must take the tone hue once an inverted meter has progress',
  );
  // The tones that invert are still exactly the two that fill up as good news.
  assert.match(code, /const INVERTED = new Set\(\['target', 'payout'\]\)/);
});
