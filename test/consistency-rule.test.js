import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  challengeState, consistencyState, cycleBound, tradingDaysState,
} from '../src/domain/prop/prop.js';
import { validateProvision } from '../src/domain/accounts/provision.js';
import { insertChallengeQuery } from '../src/domain/accounts/provisionQueries.js';
import { readBackend } from './helpers/backend-src.js';
import { readCode, readSrc } from './helpers/src-files.js';
import {
  emptyDraft, isStepComplete, patchDraft, toProvisionPayload,
} from '../frontend/src/features/accounts/newAccountFlow.js';
import { consistencyRead, pctText } from '../frontend/src/features/prop/propAccounts.js';

/* THE CONSISTENCY RULE — owner spec 2026-09-02.
 *
 * A prop firm's cap on how much of a trader's TOTAL profit may come from their single
 * best trading day: best day / total profit <= cap. The firms that run one set 15%-50%
 * (30% is the most common; Apex 50%, Top One's Ignite 15%), and plenty run none at all
 * — FTMO and FundedNext's Rapid Daily among them. Breaching it DELAYS a payout until
 * further trading dilutes that day's share; it never fails an account and never costs
 * the trader a dollar.
 *
 * WHAT THIS FILE PINS is the whole seam, because it spans five layers and can break
 * silently in each: the wizard's toggle (a rule that is off must send null, and an ON
 * toggle must not send a blank), the validator's refusals, the account row, the
 * challenge SNAPSHOT the engine judges, the engine's own math, and the one thing the
 * engine must NOT do — score this rule as a breach.
 */

// A GFT-style eval phase carrying a 30% cap. `first_on_account: true` so the whole of
// the account's history is the cycle, which is the ordinary case.
const CAPPED = {
  phase: 'p1',
  status: 'active',
  dd_type: 'static',
  start_balance: 25000,
  daily_dd_pct: 4,
  max_dd_pct: 10,
  profit_target_pct: 8,
  min_trading_days: 3,
  min_days_reset_on_payout: false,
  consistency_pct: 30,
  first_on_account: true,
  start_date: '2026-06-01T00:00:00Z',
};

const trade = (day, pnl) => ({ close_time: `2026-06-${day}T15:00:00Z`, pnl_money: pnl });
const asOf = new Date('2026-06-30T23:00:00Z');

// ── The engine ───────────────────────────────────────────────────────────────

test('no cap means no state at all, not a state that happens to pass', () => {
  /* Most accounts have no consistency rule, and a card must be able to draw NOTHING
     for them. A `{ withinCap: true }` with a null cap would read as a rule that is
     being satisfied, and the footer would spend a line on a rule the firm never set.

     0 gets its own value in this list because it is the one that LOOKS like a rule. It
     is refused at the wizard, but a hand-edited row or the legacy PATCH form can still
     store one, and a cap of 0% is unsatisfiable by any profitable account — a
     permanent payout block. Read as "no rule", it can do no harm. */
  for (const cap of [null, undefined, 0, '', -5]) {
    const c = consistencyState({ ...CAPPED, consistency_pct: cap }, [trade('02', 500)], [], asOf);
    assert.equal(c, null, `a cap of ${JSON.stringify(cap)} is not a rule`);
  }
});

test('the ratio is the best DAY over total profit, bucketed by the engine clock', () => {
  /* Two trades on the 2nd and one on the 3rd: the rule is about DAYS, so the 2nd's
     two trades are one figure of 600 and not two of 400 and 200. Total 900, best day
     600 — 66.7%, which is over a 30% cap. */
  const c = consistencyState(CAPPED, [
    trade('02', 400), trade('02', 200), trade('03', 300),
  ], [], asOf);
  assert.equal(c.totalProfit, 900);
  assert.equal(c.bestDay, 600);
  assert.equal(c.bestDayOn, '2026-06-02');
  assert.equal(c.days, 2);
  assert.equal(c.pct, 66.67);
  assert.equal(c.withinCap, false);
  // What the day is ALLOWED to hold at this total, and what total would make the day
  // it actually holds comply: 600 / 0.30 = 2000, so 1100 more profit.
  assert.equal(c.limit, 270);
  assert.equal(c.profitNeeded, 1100);
});

test('a LOSING day is subtracted from the total and can never be the best day', () => {
  // Total 700 = 1000 - 300; the best day is the 1000, which is 142.9% of the total.
  // A trader who won big and then gave some back is further from compliance than
  // before, not closer, and the figure has to say so rather than clamping at 100.
  const c = consistencyState(CAPPED, [trade('02', 1000), trade('03', -300)], [], asOf);
  assert.equal(c.totalProfit, 700);
  assert.equal(c.bestDay, 1000);
  assert.equal(c.pct, 142.86);
  assert.equal(c.withinCap, false);
});

test('exactly at the cap is COMPLIANT — the operator is <=, industry-wide', () => {
  // 400 of 1000 is over a 30% cap...
  const over = consistencyState(CAPPED, [
    trade('02', 300), trade('03', 300), trade('04', 400),
  ], [], asOf);
  assert.equal(over.bestDay, 400);
  assert.equal(over.totalProfit, 1000);
  assert.equal(over.pct, 40);
  assert.equal(over.withinCap, false);

  /* ...and 350 of 1000 is exactly ON it, which is INSIDE the rule. A trader who has
     distributed their profit to the decimal the firm asked for is compliant; a card
     that told them otherwise would send them to trade a day they do not need. */
  const at = consistencyState(CAPPED, [
    trade('02', 300), trade('03', 350), trade('04', 350),
  ], [], asOf);
  assert.equal(at.pct, 35);
  assert.equal(at.withinCap, false, '35% is still over 30%');

  const exact = consistencyState({ ...CAPPED, consistency_pct: 35 }, [
    trade('02', 300), trade('03', 350), trade('04', 350),
  ], [], asOf);
  assert.equal(exact.pct, 35);
  assert.equal(exact.withinCap, true, '35.0% on a 35% cap is inside the rule');
  assert.equal(exact.profitNeeded, null, 'nothing is needed by an account already inside');
});

test('no profit means no ratio and nothing to gate — not 0% and not a divide by zero', () => {
  /* There is no payout to delay on an account that is down, so there is nothing for
     this rule to say. `pct: null` with `withinCap: true` is how that is expressed —
     the same shape tradingDaysRead uses for an account with no minimum. A 0% would be
     the worst possible answer: it reads as perfect compliance. */
  const down = consistencyState(CAPPED, [trade('02', -500), trade('03', -200)], [], asOf);
  assert.equal(down.totalProfit, -700);
  assert.equal(down.pct, null);
  assert.equal(down.withinCap, true);
  assert.equal(down.limit, null);

  const none = consistencyState(CAPPED, [], [], asOf);
  assert.equal(none.pct, null);
  assert.equal(none.withinCap, true);
  assert.equal(none.totalProfit, 0);
  // And the cap is still reported, because the account still HAS the rule — a card
  // shows it and waits for a figure to measure against it.
  assert.equal(none.cap, 30);
});

test('a positive total with no positive DAY still has no best day', () => {
  // Reachable: one day nets to exactly zero and another is flat. Guarded because
  // `bestDay` starts null and only a strictly positive day replaces it — without the
  // `bestDay != null` half of `gated`, this would divide null by the total.
  const c = consistencyState(CAPPED, [
    trade('02', 300), trade('02', -300), trade('03', 0),
  ], [], asOf);
  assert.equal(c.totalProfit, 0);
  assert.equal(c.pct, null);
  assert.equal(c.withinCap, true);
});

test('trades are read through the same dayKey clock and the same cycle as the day count', () => {
  /* THE ONE INVARIANT THAT MAKES THE TWO FOOTER FACTS AGREE. Both rules are measured
     over cycleBound(), so a trade cannot count toward the consistency ratio on a day
     that does not count as a trading day — the contradiction an engine with two
     windows would eventually be asked to explain. */
  const funded = {
    ...CAPPED, phase: 'funded', profit_target_pct: null,
    min_days_reset_on_payout: true, first_on_account: false,
    start_date: '2026-06-01T00:00:00Z',
  };
  const payouts = [{ payout_date: '2026-06-10T00:00:00Z' }];
  const trades = [trade('05', 900), trade('12', 200), trade('13', 100)];

  // The payout on the 10th closes the cycle: the 900 on the 5th belongs to profit
  // already withdrawn and is out of the window for BOTH readings.
  const c = consistencyState(funded, trades, payouts, asOf);
  assert.equal(c.totalProfit, 300);
  assert.equal(c.bestDay, 200);
  assert.equal(c.days, 2);

  const d = tradingDaysState(funded, trades, payouts, asOf);
  assert.equal(d.completed, 2, 'the day count must see the same two days');
  assert.equal(
    cycleBound(funded, payouts, asOf).toISOString(),
    new Date('2026-06-10T00:00:00Z').toISOString(),
  );
});

test('a trade with no close time or no money is not a day', () => {
  const c = consistencyState(CAPPED, [
    trade('02', 500), { close_time: null, pnl_money: 400 },
    { close_time: '2026-06-03T15:00:00Z', pnl_money: null },
    { close_time: 'not-a-date', pnl_money: 900 },
  ], [], asOf);
  assert.equal(c.days, 1);
  assert.equal(c.totalProfit, 500);
});

test('the rule NEVER breaches an account and never touches its health', () => {
  /* THE MOST IMPORTANT ASSERTION IN THIS FILE. Every firm surveyed treats an
     oversized day as a payout DELAY: the share falls on its own as the trader keeps
     trading, nothing is forfeited and no account is closed. An engine that folded
     this into `breach` or into healthScore would tell a trader they are out when they
     are merely early — and challengeStatus settles a challenge on that flag. */
  const trades = [trade('02', 1000), trade('03', 50)];
  const over = challengeState({ challenge: CAPPED, trades, asOf });
  const without = challengeState({
    challenge: { ...CAPPED, consistency_pct: null }, trades, asOf,
  });

  assert.equal(over.consistency.withinCap, false, 'the fixture must actually be over');
  assert.equal(over.breach.breached, false);
  assert.equal(over.breach.reason, null);
  assert.deepEqual(
    over.health, without.health,
    'the cap must not move the health score by a single point',
  );
  assert.equal(without.consistency, null, 'and an uncapped account reports no state');
});

test('challengeState carries the state onto the card payload', () => {
  const s = challengeState({
    challenge: CAPPED, trades: [trade('02', 300), trade('03', 700)], asOf,
  });
  assert.equal(s.consistency.cap, 30);
  assert.equal(s.consistency.pct, 70);
  assert.equal(s.consistency.withinCap, false);
});

// ── The validator and the two writes ─────────────────────────────────────────

const propBody = (over = {}) => ({
  capital_kind: 'prop', label: 'GFT 2-Step 50K', currency: 'USD',
  platform: 'mt5', import_method: 'manual',
  firm_id: 'gft', firm_name: 'GoatFundedTrader', product_id: '2step', phase: 'p1',
  start_balance: 50000, account_type: 'eval',
  daily_dd_pct: 5, max_dd_pct: 10, profit_target_pct: 8, min_trading_days: 3,
  ...over,
});

test('validateProvision: a cap is optional, and absent stays absent', () => {
  // Absence is the answer for "this account has no consistency rule", and it is the
  // common one. There is no default to fall back to: the firms disagree.
  assert.equal(validateProvision(propBody()).value.consistency_pct, null);
  assert.equal(validateProvision(propBody({ consistency_pct: '' })).value.consistency_pct, null);
  assert.equal(validateProvision(propBody({ consistency_pct: null })).value.consistency_pct, null);
});

test('validateProvision: a real cap is carried, fractions included', () => {
  assert.equal(validateProvision(propBody({ consistency_pct: 30 })).value.consistency_pct, 30);
  // A form sends strings, and firms quote 12.5% as readily as 30%.
  assert.equal(validateProvision(propBody({ consistency_pct: '12.5' })).value.consistency_pct, 12.5);
  assert.equal(validateProvision(propBody({ consistency_pct: 100 })).value.consistency_pct, 100);
});

test('validateProvision: 0 is refused, because it is not a lenient rule', () => {
  /* 0% says no single day may hold ANY share of the profit — unsatisfiable by every
     profitable account, so it is a permanent payout block rather than a soft rule. It
     can only be a mis-typed or mis-parsed "off", and absence has to stay the only way
     to say there is no rule. */
  const r = validateProvision(propBody({ consistency_pct: 0 }));
  assert.equal(r.ok, false);
  assert.match(r.error, /consistency/i);
  assert.equal(validateProvision(propBody({ consistency_pct: '0' })).ok, false);
  assert.equal(validateProvision(propBody({ consistency_pct: -10 })).ok, false);
});

test('validateProvision: a cap above 100 is refused, and rubbish is not silently dropped', () => {
  // A day cannot be more than all of the profit.
  assert.equal(validateProvision(propBody({ consistency_pct: 101 })).ok, false);
  /* AND A NON-NUMBER FAILS LOUDLY rather than becoming null. numOrNull turns 'thirty'
     into null, which the value object cannot tell apart from "the trader did not
     answer" — so a typo would silently create an account with no consistency rule
     while the trader believes they set one. */
  const bad = validateProvision(propBody({ consistency_pct: 'thirty' }));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /number/i);
});

test('the cap reaches the CHALLENGE, which is the row the engine judges', () => {
  /* The account row is what Settings edits; the challenge row is the snapshot the prop
     engine measures against, so a cap that stopped at the account would be a rule the
     trader can see and the engine cannot. */
  const q = insertChallengeQuery(42, {
    dd_type: 'static', start_balance: 50000, daily_dd_pct: 5, max_dd_pct: 10,
    profit_target_pct: 8, min_trading_days: 3, phase: 'p1', consistency_pct: 30,
  });
  assert.match(q.text, /consistency_pct/);
  assert.ok(q.values.includes(30));

  // ON A FUNDED PHASE TOO, unlike the profit target. Firms apply this rule on either
  // side and often on both at different numbers (Apex funded only, Take Profit Trader
  // evaluation only, Alpha Futures 50% eval / 40% funded), so there is no phase the
  // engine may decide the rule cannot exist on.
  const funded = insertChallengeQuery(42, {
    dd_type: 'static', start_balance: 50000, daily_dd_pct: 5, max_dd_pct: 10,
    profit_target_pct: 8, min_trading_days: 0, phase: 'funded', consistency_pct: 40,
  });
  assert.ok(funded.values.includes(40), 'a funded phase keeps its cap');
});

test('every path that opens or advances a challenge copies the cap forward', () => {
  /* Four writers create a challenge row, and one that forgot the column would drop the
     rule at exactly one lifecycle moment — most likely at a phase advance, days after
     anyone would connect the two. */
  const ch = readBackend('domain/prop/challenges.js');
  const inserts = ch.match(/INSERT INTO challenges[\s\S]*?VALUES/g) || [];
  assert.ok(inserts.length >= 2, 'expected createChallengeForAccount and advanceChallenge');
  for (const stmt of inserts) {
    assert.match(stmt, /consistency_pct/, 'a challenge INSERT that drops the cap');
  }
  // Both of them read it off the ACCOUNT, so there is a value to copy.
  const selects = ch.match(/SELECT id[\s\S]*?FROM mt5_accounts/g) || [];
  assert.ok(selects.length >= 2);
  for (const s of selects) assert.match(s, /consistency_pct/);
  // And editing the rule reaches the LIVE challenge, or the engine keeps judging the
  // old number while the form shows the new one.
  assert.match(ch, /consistency_pct: 'consistency_pct'/);
});

test('the cap rides on the account payload every client already holds', () => {
  const acc = readBackend('domain/accounts/accounts.js');
  // Unlike challenge_fee, this is a rule the UI has to SHOW, so it belongs in the
  // shape every /api/accounts payload is built from.
  assert.match(acc, /ACCOUNT_COLUMNS =[\s\S]{0,900}?consistency_pct/);
  // listAccounts selects its own explicit column list, and a column missing there
  // reads as null on a payload that otherwise has it — the exact shape of the
  // dd_type/min_trading_days bug accounts.test.js was written for.
  assert.match(acc, /a\.consistency_pct/);
  // And it is editable, or a trader who learns their firm's real number has nowhere
  // to put it.
  assert.match(acc, /const allowed = \[[^\]]*'consistency_pct'/);
});

// ── The wizard ───────────────────────────────────────────────────────────────

const propDraft = (over = {}) => ({
  ...emptyDraft(),
  welcomed: true,
  capital_kind: 'prop',
  firm_id: 'gft',
  challenge_mode: 'new',
  product_id: '2step',
  phase: 'p1',
  label: 'GFT 2-Step 50K',
  start_balance: 50000,
  daily_dd_pct: 5,
  max_dd_pct: 10,
  profit_target_pct: 8,
  min_trading_days: 3,
  consistency_pct: 30,
  platform: 'mt5',
  import_method: 'manual',
  ...over,
});

test('a fresh draft carries no cap — the toggle starts off', () => {
  assert.equal(emptyDraft().consistency_pct, null);
});

test('the cap is OPTIONAL — the account step completes without one', () => {
  // Most accounts have no consistency rule, so demanding one would block the majority
  // of traders on page 3 over a rule their firm does not have.
  assert.equal(isStepComplete(propDraft({ consistency_pct: null }), 'account'), true);
  assert.equal(isStepComplete(propDraft(), 'account'), true);
});

test('changing the purchase clears the cap with the other rules', () => {
  /* Firms set this per plan AND per phase, so a 50% cap carried from a 2-Step
     evaluation onto a funded account is a rule that account is not under. */
  assert.equal(patchDraft(propDraft(), { firm_id: 'ftmo' }).consistency_pct, null);
  assert.equal(patchDraft(propDraft(), { product_id: '1step' }).consistency_pct, null);
  assert.equal(patchDraft(propDraft(), { capital_kind: 'live' }).consistency_pct, null);
  // A patch that changes nothing relevant leaves it alone: the page re-patches its
  // whole form on every submit, and clearing on that would wipe the trader's answer.
  assert.equal(patchDraft(propDraft(), { label: 'Renamed' }).consistency_pct, 30);
});

test('the payload sends the cap on the prop path and never on the live one', () => {
  assert.equal(toProvisionPayload(propDraft()).consistency_pct, 30);
  // A live account is the trader's own money: there is no firm to gate a withdrawal,
  // and a cap on one would draw a payout gate that cannot exist.
  const live = toProvisionPayload(propDraft({ capital_kind: 'live', consistency_pct: 30 }));
  assert.equal(live.consistency_pct, null);
});

test('the field is a toggle in front of the label, with the input disabled while off', () => {
  const src = readSrc('AccountStep.jsx');
  const code = readCode('AccountStep.jsx');
  // The owner's spec: a switch ahead of the title text, off by default, the box
  // disabled until it is on.
  assert.match(code, /<Switch/, 'the toggle must be the Switch primitive');
  assert.match(
    code,
    /<FieldLabel htmlFor="naf-consistency">[\s\S]{0,400}?<Switch[\s\S]{0,400}?Consistency Rule/,
    'the Switch sits INSIDE the FieldLabel, ahead of the title — registry p-field-15',
  );
  assert.match(code, /disabled=\{!consistencyOn\}/, 'the input is disabled while the rule is off');
  // Named for a screen reader: FieldLabel's htmlFor points at the INPUT, so the switch
  // would otherwise be an unnamed control inside someone else's label.
  assert.match(code, /aria-label="This account has a consistency rule"/);
  // Off by default for a new draft, and ON when the draft already holds a cap — a
  // trader who walked forward and came back must find their toggle as they left it.
  assert.match(code, /useState\(\(\) => draft\.consistency_pct != null\)/);
  // NOT pre-filled with the industry's 30%: a cap is the number the firm's rulebook
  // states, and a seeded default is a number the trader never read.
  assert.match(src, /NOT PRE-FILLED WITH 30/);
  assert.doesNotMatch(code, /setRule\('consistency_pct', '30'\)/);
});

test('the toggle is the answer, and an ON toggle cannot submit a blank', () => {
  const code = readCode('AccountStep.jsx');
  // Off sends null however much is typed in the disabled box: the trader has said the
  // account has no consistency rule, and a stale number must not outvote them.
  assert.match(code, /consistency_pct: consistencyOn \? num\(rules\.consistency_pct\) : null/);
  // And the other direction — on with an empty box would send null, which is the
  // OPPOSITE of what the trader said, so Continue waits instead.
  assert.match(code, /!consistencyOn \|\| filled\(rules\.consistency_pct\)/);
});

// ── The card ─────────────────────────────────────────────────────────────────

test('consistencyRead: no rule reads as nothing to draw', () => {
  for (const c of [null, undefined, {}, { cap: null }, { cap: 0 }]) {
    assert.equal(consistencyRead(c).has, false, `${JSON.stringify(c)} is not a rule`);
  }
  assert.equal(consistencyRead(null).cap, null);
  assert.equal(consistencyRead(null).withinCap, true, 'nothing to be over');
});

test('consistencyRead: a cap with no ratio yet is a real state', () => {
  const r = consistencyRead({ cap: 30, pct: null, withinCap: true });
  assert.equal(r.has, true);
  assert.equal(r.cap, 30);
  assert.equal(r.pct, null, 'a card shows the cap and waits — never a 0%');
});

test('consistencyRead passes the ENGINE verdict through and never re-derives it', () => {
  /* The boundary case is the reason: 30.0% of profit on a 30% cap is COMPLIANT, and a
     card that recomputed `pct <= cap` in floating point could disagree with the engine
     about the one comparison that decides whether the figure turns amber. */
  assert.equal(consistencyRead({ cap: 30, pct: 30, withinCap: true }).withinCap, true);
  assert.equal(consistencyRead({ cap: 30, pct: 30.01, withinCap: false }).withinCap, false);
  // Only an explicit false is over. A state from before the field existed reads as
  // compliant rather than as a warning nobody can explain.
  assert.equal(consistencyRead({ cap: 30, pct: 20 }).withinCap, true);
  assert.equal(consistencyRead({ cap: 30, pct: 66.67, profitNeeded: 1100 }).profitNeeded, 1100);
});

test('pctText: one decimal at most, and none when the figure is whole', () => {
  assert.equal(pctText(30), '30%');
  assert.equal(pctText(66.67), '66.7%');
  assert.equal(pctText(42.04), '42%');
  assert.equal(pctText(null), null);
  assert.equal(pctText('abc'), null);
});

test('the footer draws the rule beside the day count, and nothing when there is none', () => {
  const code = readCode('Dashboard.jsx');
  const src = readSrc('Dashboard.jsx');
  assert.match(code, /consistency = consistencyRead\(data\.consistency\)/);
  // Beside the trading-day fact, inside the same AccountCardFoot — the two things a
  // firm checks before it pays that are not drawdown meters.
  assert.match(
    code,
    /Minimum trading days requirement[\s\S]{0,900}?consistency\.has \?[\s\S]{0,900}?consistency cap/,
    'the consistency read must follow the day count inside the footer',
  );
  // NOTHING for an account without the rule — the opposite call from the day count
  // above it, which does state its absence, because every prop account HAS a
  // minimum-days rule while a consistency cap is one an account either carries or not.
  assert.doesNotMatch(code, /No consistency rule/);
  // Over the cap is AMBER, never red: being over is a payout delay, and a red figure
  // beside the breach banner's red would say the account is gone.
  assert.match(code, /tone=\{consistency\.withinCap \? 'default' : 'warn'\}/);
  assert.match(src, /OVER THE CAP IS AMBER, NEVER RED/);
});

test('the amber tone is a PROP on the primitive, because a page cannot write a class', () => {
  /* Tailwind compiles utilities only under components/{ui,primitives}, so a colour
     class written in Dashboard.jsx emits nothing — silently. This has cost real
     debugging time five times (§1), and it is why the figure takes a tone rather than
     a className. */
  const prim = readCode('components/primitives/account.jsx');
  assert.match(prim, /AccountFootFigure\(\{ tone = 'default'/);
  const foot = prim.match(/const FOOT_TONE = \{[\s\S]*?\};/);
  assert.ok(foot, 'the footer figure resolves its tone from a map, not inside cn()');
  assert.match(foot[0], /warn: 'text-\[var\(--warning-bright\)\]'/);
  // Scoped to THIS map on purpose — the card's breach banner further up the file is
  // legitimately red, and a payout delay must not borrow that red.
  assert.doesNotMatch(foot[0], /--loss/, 'a payout delay is not a loss');
});

test('the switch primitive fixes the OFF state the preset draws invisibly', () => {
  /* The generated switch is authored light-first: its thumb is bg-background
     (--zinc-950) and its unchecked track is bg-input (--line, #1a1a1d) — a 1.05:1
     contrast, so the off switch has no visible thumb in our dark theme. Off is the
     DEFAULT state of the first switch in this app, so the invisible half is the half a
     trader sees first. */
  const sw = readCode('components/primitives/switch.jsx');
  assert.match(sw, /data-unchecked:bg-\[var\(--line-strong\)\]/);
  assert.match(sw, /data-unchecked:\[&_\[data-slot=switch-thumb\]\]:bg-\[var\(--text-4\)\]/);
  // The ON state is the preset's, untouched — this is a legibility fix, not a
  // foundation change, and bg-primary/bg-background stay where they are.
  assert.match(readSrc('components/ui/switch.jsx'), /data-checked:bg-primary/);
  assert.doesNotMatch(sw, /data-checked:bg-/);
  // The app imports it from the primitives seam, never from components/ui.
  assert.match(readCode('components/primitives/index.js'), /export \{ Switch \} from '\.\/switch\.jsx'/);
});
