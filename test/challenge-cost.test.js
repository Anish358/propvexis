import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_FEE_NOTE, FEE_TYPES, challengeFeeQuery, challengeFeeType, hasChallengeFee,
} from '../src/domain/finance/fees.js';
import { validateProvision } from '../src/domain/accounts/provision.js';
import { readBackend } from './helpers/backend-src.js';
import { readCode, readSrc } from './helpers/src-files.js';
import {
  emptyDraft, isStepComplete, patchDraft, toProvisionPayload,
} from '../frontend/src/features/accounts/newAccountFlow.js';

/* WHAT A CHALLENGE COST — owner spec 2026-09-02.
 *
 * The Add Account wizard asks the entry fee on its New-challenge branch, and the amount
 * becomes an ordinary `account_fees` row (0018) so every finance surface we already have
 * picks it up with no new reader: the ROI summary, the by-firm breakdown, the progression
 * chart, the ledger, and the trader's own ability to delete it.
 *
 * THIS FILE PINS THE SEAM — the part that spans four layers and can break in each of
 * them silently: the wizard's field and its branch, the payload, the validator's two
 * refusals, the fee builder, and the deferred write an EA account depends on. Whether the
 * money then sums correctly is finance.test.js's job and unchanged, because a challenge
 * cost IS a fee and there is no second code path for it.
 */

// ── The fee builder ──────────────────────────────────────────────────────────

const acct = (over = {}) => ({
  id: 42, user_id: 7, mt5_login: 314943467, account_type: 'eval',
  created_at: '2026-09-02T10:00:00.000Z', ...over,
});

test('the cost is filed under a fee type the schema already has', () => {
  // 0018 shipped 'evaluation' and 'activation', and an Instant-funding account really
  // does pay the second one. Both must be in FEE_TYPES, or POST /api/fees, the ledger's
  // FEE_CATEGORY labels and the by-category filter would each disagree in their own way.
  assert.equal(challengeFeeType('eval'), 'evaluation');
  assert.equal(challengeFeeType('funded'), 'activation');
  // Anything unrecognised reads as an evaluation rather than as nothing: fee_type is
  // NOT NULL, and 'eval' is mt5_accounts' own default for the column this derives from.
  assert.equal(challengeFeeType(undefined), 'evaluation');
  for (const t of ['evaluation', 'activation']) {
    assert.ok(FEE_TYPES.includes(t), `${t} must be a known fee type`);
  }
});

test('a cost is postable only when there is money AND a login to key it by', () => {
  /* Both halves in one predicate because both write sites ask the same question, and a
   * missing half fails silently either way: no amount check posts a NULL into a NOT NULL
   * column (a 500 at the end of the wizard), no login check keys the row to `null` — a
   * fee belonging to no account, invisible in every scope and unattributable later. */
  assert.equal(hasChallengeFee(acct(), 49.5), true);
  assert.equal(hasChallengeFee(acct(), '49.5'), true, 'a form sends strings');
  assert.equal(hasChallengeFee(acct(), null), false, 'not answered');
  assert.equal(hasChallengeFee(acct(), 0), false, 'answered, but no money moved');
  assert.equal(hasChallengeFee(acct(), 'free'), false);
  assert.equal(hasChallengeFee(acct({ mt5_login: null }), 49.5), false, 'a pending EA account');
  // A manual account's synthetic NEGATIVE login is a real key (migration 0015), so its
  // fee is postable like anyone else's. `mt5_login != null` is the test, never truthiness.
  assert.equal(hasChallengeFee(acct({ mt5_login: -42 }), 49.5), true);
});

test('the fee INSERT is idempotent, attributed, and interpolates nothing', () => {
  const q = challengeFeeQuery(acct(), 49.5);
  assert.match(q.text, /INSERT INTO account_fees/);
  // ext_ref + ON CONFLICT is what makes the deferred path safe to run more than once:
  // 0018 put a unique index on (account_id, ext_ref) for exactly this.
  assert.match(q.text, /ON CONFLICT DO NOTHING/);
  assert.deepEqual(q.values, [
    314943467, 7, '2026-09-02T10:00:00.000Z', 49.5, 'evaluation',
    // Keyed by the ACCOUNT's id, not by its login: the login is the thing that may not
    // exist yet, and one account buys one challenge.
    'provision:42',
    CHALLENGE_FEE_NOTE,
  ]);
  assert.equal(/314943467|49\.5|provision:42/.test(q.text), false, 'a value was interpolated');
});

test("the fee's source is 'manual', because the trader typed the number", () => {
  /* Not bookkeeping pedantry: financeData.js derives the ledger's Reviewed /
   * Needs-review status from `source` ALONE, so an 'ea' or 'import' source would flag a
   * figure the trader entered by hand as unconfirmed and ask them to check it. */
  assert.match(challengeFeeQuery(acct(), 49.5).text, /'manual'/);
  assert.match(readSrc('financeData.js'), /source === 'manual' \? 'reviewed'/,
    'if the ledger stops reading source, re-read the reason this fee claims manual');
});

// ── The deferred half: an EA account has no login until it binds ─────────────

test('binding a pending account posts its cost, off the UPDATE own RETURNING', () => {
  /* THE ONE MOMENT an EA account stops being pending, and so the first moment its cost
   * can be recorded at all — account_fees is keyed by MT5 login. Pinned as source rather
   * than behaviour because this repo has no test database and bindOrCheckLogin talks to
   * `query()` directly.
   *
   * The RETURNING list is the load-bearing half. Six call sites hand bindOrCheckLogin
   * rows fetched by four different queries (accountByToken selects *, ownedAccountById a
   * column list), so reading the cost off the `account` ARGUMENT would post the fee on
   * some ingest paths and skip it on others — silently, and only for EA users. */
  const src = readBackend('domain/accounts/accounts.js');
  const bind = src.slice(src.indexOf('export async function bindOrCheckLogin'));
  const update = bind.slice(0, bind.indexOf('[account.id, login]'));
  for (const col of ['mt5_login', 'user_id', 'account_type', 'created_at', 'challenge_fee']) {
    assert.match(update, new RegExp(`RETURNING[\\s\\S]*${col}`),
      `the bind UPDATE must return ${col} — the fee is built from this row, not the argument`);
  }
  assert.match(bind, /postChallengeFee\(rows\[0\]\)/, 'and built from that returned row');

  /* ON THE 'bound' BRANCH ONLY. A replayed first trade takes the 'ok' path, and posting
   * there would re-charge on every upload — ext_ref would catch it, but relying on a
   * unique index to undo a write we should not have attempted is not the design. */
  const okBranch = bind.slice(0, bind.indexOf('try {'));
  assert.equal(/postChallengeFee/.test(okBranch), false,
    'an already-bound account must not re-post its cost on every ingest');

  /* AND IT MUST NOT BE ABLE TO FAIL THE INGEST. This runs inside the EA's trade upload:
   * the trades are what the account exists for, and the cost is bookkeeping the trader
   * can still enter by hand in Prop OS > Finance. */
  assert.match(bind, /try \{\s*await postChallengeFee/, 'the post is guarded');
  assert.match(bind, /catch \(err\) \{\s*console\.error/, 'and a failure is reported, not swallowed');
});

test('the account API does not carry the cost — the fee row is the only figure', () => {
  /* 0031's rule: the column is the durable record of the answer and the source for the
   * deferred write; the account_fees row is what anything user-facing reads. A client
   * holding both would have two numbers for one purchase, and summing both would
   * double-count every challenge in the spend figure this whole feature feeds. */
  const cols = readBackend('domain/accounts/accounts.js')
    .match(/export const ACCOUNT_COLUMNS =\s*\n?\s*'([^']+)'/);
  assert.ok(cols, 'ACCOUNT_COLUMNS is readable');
  assert.equal(cols[1].includes('challenge_fee'), false,
    'the cost must not ride on account API responses — see 0031');
});

// ── The wizard: the draft, the cascade, the payload ──────────────────────────

const propDraft = (over = {}) => patchDraft(emptyDraft(), {
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
  challenge_fee: 49.5,
  platform: 'mt5',
  import_method: 'manual',
  ...over,
});

test('the cost is OPTIONAL — the account step completes without it', () => {
  // The owner asked for "an option of adding" it. A trader who does not remember what
  // they paid must not be stuck on page 3; they can add it later in Finance.
  assert.equal(isStepComplete(propDraft({ challenge_fee: null }), 'account'), true);
  assert.equal(isStepComplete(propDraft(), 'account'), true);
});

test('changing the firm, type or size clears the cost with the rules', () => {
  /* What a challenge cost is a property of a PURCHASE — this firm's 2-Step 50K — not of
   * the account. Carrying the number across is how a $49 25K evaluation gets filed as
   * the cost of a $499 200K one, and the ledger cannot tell afterwards. */
  assert.equal(patchDraft(propDraft(), { firm_id: 'ftmo' }).challenge_fee, null);
  assert.equal(patchDraft(propDraft(), { product_id: '1step' }).challenge_fee, null);
  assert.equal(patchDraft(propDraft(), { capital_kind: 'live' }).challenge_fee, null);
  // A patch that changes nothing relevant leaves it alone — the page re-patches its whole
  // form on every submit, and clearing on that would wipe the trader's own answer.
  assert.equal(patchDraft(propDraft(), { label: 'Renamed' }).challenge_fee, 49.5);
});

test('the payload sends a cost on the NEW branch and never on the EXISTING one', () => {
  /* Gated exactly as `challenge_group_id` is, for the mirror-image reason: that field
   * rides only when there IS a challenge to join, this one only when there is not.
   * validateProvision refuses the pair, so without this nulling a trader who typed a cost
   * under New and then switched to Existing would 400 on the wizard's last page — with
   * the offending number no longer on screen. */
  assert.equal(toProvisionPayload(propDraft()).challenge_fee, 49.5);

  const joined = propDraft({ challenge_mode: 'existing', challenge_group_id: 12 });
  assert.equal(joined.challenge_fee, 49.5, 'the draft may still hold it');
  assert.equal(toProvisionPayload(joined).challenge_fee, null, 'but the payload must not');

  const live = patchDraft(emptyDraft(), {
    capital_kind: 'live', label: 'IC Live', platform: 'mt5', import_method: 'manual',
  });
  assert.equal(toProvisionPayload(live).challenge_fee, null, 'a live account bought no challenge');
});

test('the wizard payload is accepted by the validator that receives it', () => {
  // The end-to-end pin: asserted against validateProvision itself rather than against a
  // restatement of its rules, which is how this suite already checks the rest of the
  // payload. Both branches, because each carries a different one of the mutually
  // exclusive pair.
  const fresh = validateProvision(toProvisionPayload(propDraft()));
  assert.equal(fresh.ok, true, fresh.error);
  assert.equal(fresh.value.challenge_fee, 49.5);

  const joined = toProvisionPayload(propDraft({ challenge_mode: 'existing', challenge_group_id: 12 }));
  const r = validateProvision(joined);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.value.challenge_fee, null);
  assert.equal(r.value.challenge_group_id, 12);
});

// ── The page ─────────────────────────────────────────────────────────────────

test('the field is rendered only on the New challenge branch', () => {
  /* The owner's rule, and the reason is money: a phase of an existing challenge was paid
   * for when that challenge was created, so asking again is how one challenge comes to be
   * counted twice in spend.
   *
   * CONDITIONALLY RENDERED, never hidden with a utility. `hidden` written in a step file
   * compiles to nothing at all (tailwind.css scopes @source to components/{ui,primitives}),
   * and even under components it loses to an author `display` — DESIGN-LANGUAGE §1. */
  const src = readCode('AccountStep.jsx');
  assert.match(src, /\{mode === 'new' \? \([\s\S]{0,400}Challenge Cost/,
    'the field must be gated on the New-challenge branch');
  const field = src.slice(src.indexOf('Challenge Cost'));
  assert.equal(/hidden/.test(field.slice(0, 600)), false, 'a hidden utility here emits nothing');

  // And the value follows the same branch out of the page, so state left behind by
  // switching tabs cannot be submitted.
  assert.match(src, /challenge_fee: mode === 'new' \? num\(fee\) : null/);

  /* BLANK IS NULL, NOT ZERO — unlike min_trading_days on the same page, which reads a
   * blank field as 0 because "no requirement" is a real rule. A blank cost means "I have
   * not said"; 0 means "it was free" and posts no fee row. Collapsing the two would leave
   * a trader believing they had recorded a cost they never entered. */
  assert.match(src, /min_trading_days: rules\.min_trading_days\.trim\(\) === '' \? 0 : num/,
    'the neighbouring field really does read blank as 0 — that is the contrast');

  /* AND NO HELPER LINE UNDER IT (owner call 2026-09-02). This used to assert the
   * opposite — a FieldDescription naming Prop OS > Finance, on the reasoning that a
   * figure which silently appears in a money view the trader did not open is worse than
   * one they were warned about. The owner removed it, and the consistency rule's
   * description with it: two described fields in a two-column grid put a paragraph of
   * prose inside a form of seven labelled boxes and left each described field two lines
   * taller than the one beside it. Pinned rather than merely deleted, so the line does
   * not drift back in. */
  assert.doesNotMatch(readCode('AccountStep.jsx'), /<FieldDescription/);
});
