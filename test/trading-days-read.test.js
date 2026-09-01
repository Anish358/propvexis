import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tradingDaysRead } from '../frontend/src/features/prop/propAccounts.js';
import { readSrc, stripComments } from './helpers/src-files.js';

/* HOW A MINIMUM-TRADING-DAYS REQUIREMENT READS, in one place.
 *
 * Four surfaces print this figure — the dashboard's account card, Prop OS's KPI tile,
 * the challenge cards and the Details meter — and each had its own arithmetic. Two of
 * them were wrong in different ways at once: "7/0" for a firm asking no minimum, and
 * "4/3" once the requirement was met. A gate is answered, not tallied. */

test('the count stops at the requirement — a gate is answered, not tallied', () => {
  const r = tradingDaysRead({ completed: 4, required: 3 });
  assert.equal(r.count, '3/3', 'never 4/3');
  assert.equal(r.done, 3);
  assert.equal(r.met, true);
});

test('exactly meeting it is met', () => {
  const r = tradingDaysRead({ completed: 3, required: 3 });
  assert.equal(r.count, '3/3');
  assert.equal(r.met, true);
});

test('short of it, the real progress shows', () => {
  const r = tradingDaysRead({ completed: 1, required: 3 });
  assert.equal(r.count, '1/3');
  assert.equal(r.done, 1);
  assert.equal(r.met, false);
  assert.equal(r.required - r.done, 2, 'the "to go" figure the KPI tile prints');
});

test('no requirement is not zero progress toward one', () => {
  /* `has: false` is what stops a caller drawing an unfinished gate for a rule the
   * account does not have; `met: true` is what stops it reading as outstanding. The days
   * actually traded survive, because they are worth knowing either way. */
  const r = tradingDaysRead({ completed: 7, required: 0 });
  assert.equal(r.has, false);
  assert.equal(r.met, true);
  assert.equal(r.count, null, 'there is no fraction to print');
  assert.equal(r.done, 7, 'the days traded are still a fact');
});

test('a missing or malformed requirement reads as no requirement, never as a crash', () => {
  for (const d of [null, undefined, {}, { completed: 2 }, { required: null }]) {
    const r = tradingDaysRead(d);
    assert.equal(r.has, false, `${JSON.stringify(d)} must not claim a requirement`);
    assert.equal(r.count, null);
    assert.equal(Number.isFinite(r.done), true, 'done is always a number');
  }
});

test('the raw engine figure is never mutated — only the way it reads is capped', () => {
  // Other surfaces legitimately want "how many days has this account traded", and the
  // backend's own alert copy says "5 of 3 trading days complete". This caps the reading,
  // not the fact.
  const d = { completed: 9, required: 3 };
  tradingDaysRead(d);
  assert.equal(d.completed, 9);
});

test('every surface that prints the figure reads this one helper', () => {
  /* The point of extracting it. Four copies of "completed / required" is how one surface
   * gets the cap and the next keeps printing 4/3. */
  for (const file of ['Dashboard.jsx', 'AccountKpiCards.jsx', 'ChallengeCard.jsx', 'challengesData.js']) {
    const src = stripComments(readSrc(file));
    assert.match(src, /tradingDaysRead/, `${file} must read the shared helper`);
    assert.equal(
      /tradingDays\.completed\}\/\{|\$\{[a-z]*\.?tradingDays\.completed\}\/\$\{/.test(src),
      false,
      `${file} still formats the fraction itself`,
    );
  }
});

test('the Details meter caps its figure as well as its bar', () => {
  // `frac` was already clamped, so the bar stopped at full while the figure beside it
  // read "4 / 3" — the two halves of one meter disagreeing.
  const src = stripComments(readSrc('challengesData.js'));
  const block = src.slice(src.indexOf("key: 'days'"), src.indexOf("key: 'days'") + 400);
  assert.match(block, /current: days\.done/);
  assert.match(block, /limit: days\.required/);
  assert.match(block, /met: days\.met/);
});
