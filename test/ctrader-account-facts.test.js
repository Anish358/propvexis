import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { traderAccountFacts } from '../src/domain/sync/connectors/ctrader.js';
import {
  sanitizeBrokerFacts, setBrokerCurrencyQuery, upsertBrokerBalanceQuery,
} from '../src/domain/sync/brokerAccount.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/* THE ACCOUNT'S OWN BALANCE AND DEPOSIT CURRENCY.
 *
 * PROD, 2026-09-05. A Spotware EUR demo was recorded as USD, because
 * ProtoOAGetAccountListByAccessTokenRes -- the only thing discovery can call -- does not
 * carry a currency, so routes/ctrader.js provisioned with its 'USD' fallback and nothing
 * anywhere ever corrected it. And prod account 33 had no `accounts` row at all: the only
 * source of a balance was a CLOSING DEAL, and that account has never closed one.
 *
 * ProtoOATrader carries both. It was already being fetched on every job for
 * registrationTimestamp and the rest of it thrown away.
 */

// A real ProtoOATrader shape. moneyDigits is the MESSAGE'S OWN and is not the one on a
// deal's closePositionDetail — that conflation is the 100x trap this connector exists
// to make impossible.
const TRADER = {
  ctidTraderAccountId: 48583094,
  balance: 99987,
  moneyDigits: 2,
  depositAssetId: 3,
  traderLogin: 5901626,
  registrationTimestamp: 1788618108413,
};
const ASSETS = [
  { assetId: 1, name: 'USD', displayName: 'US Dollar' },
  { assetId: 3, name: 'EUR', displayName: 'Euro' },
];

test('the deposit asset id becomes a currency code', () => {
  const facts = traderAccountFacts(TRADER, ASSETS);
  assert.equal(facts.currency, 'EUR', 'the prod account, correctly');
  assert.equal(facts.balance, 999.87, 'scaled by the message\'s own moneyDigits');
});

test('`name` is the code, never `displayName`', () => {
  // displayName is prose. 'Euro' in a currency column is a sentence where a code belongs,
  // and it would not match anything downstream that compares currencies.
  assert.equal(traderAccountFacts(TRADER, ASSETS).currency, 'EUR');
  assert.notEqual(traderAccountFacts(TRADER, ASSETS).currency, 'Euro');
});

test('moneyDigits is honoured, and never defaults to 0', () => {
  // A default of 0 reports cents as whole units: a silent 100x overstatement that still
  // looks entirely plausible on a dashboard.
  assert.equal(traderAccountFacts({ ...TRADER, moneyDigits: undefined }, ASSETS).balance, 999.87);
  assert.equal(traderAccountFacts({ ...TRADER, balance: 100530999, moneyDigits: 5 }, ASSETS).balance, 1005.30999);
});

test('an unresolvable asset still yields the balance', () => {
  // The asset list is a separate request and fetchAssets() swallows its failure on
  // purpose. Losing the currency must not lose the balance with it — the balance is the
  // half the prop engine's reconciliation actually needs.
  const facts = traderAccountFacts(TRADER, []);
  assert.equal(facts.currency, null);
  assert.equal(facts.balance, 999.87);
});

test('nothing worth writing returns null, not an object of nulls', () => {
  // So a caller can pass the result straight on without deciding what an absent field
  // means, and cannot write "the broker says nothing" over what it already holds.
  assert.equal(traderAccountFacts(null, ASSETS), null);
  assert.equal(traderAccountFacts({ ctidTraderAccountId: 1 }, ASSETS), null);
});

test('a zero balance is a fact, not an absence', () => {
  // A blown demo really does hold 0, and `balance || null` would drop it — leaving the
  // reconciliation blind to the single most obviously wrong account there is.
  const facts = traderAccountFacts({ ...TRADER, balance: 0 }, ASSETS);
  assert.equal(facts.balance, 0);
});

// --------------------------------------------------------------------------
// The write side. The worker's body is treated as hostile (see the note on
// POST /api/sync/jobs/:id/result), so nothing reaches SQL unsanitized.
// --------------------------------------------------------------------------

test('sanitizeBrokerFacts refuses anything that is not a number and a code', () => {
  assert.deepEqual(sanitizeBrokerFacts({ balance: 999.87, currency: 'eur' }), { balance: 999.87, currency: 'EUR' });
  assert.deepEqual(sanitizeBrokerFacts({ balance: '12.5', currency: ' USD ' }), { balance: 12.5, currency: 'USD' });
  assert.deepEqual(sanitizeBrokerFacts({ balance: 0, currency: null }), { balance: 0, currency: null });
  // A currency column is not a text sink.
  assert.equal(sanitizeBrokerFacts({ currency: "US'; DROP TABLE accounts;--" }), null);
  assert.equal(sanitizeBrokerFacts({ balance: 'abc' }), null);
  assert.equal(sanitizeBrokerFacts({ balance: Infinity }), null);
  assert.equal(sanitizeBrokerFacts(null), null);
  assert.equal(sanitizeBrokerFacts('EUR'), null);
});

test('the balance row is keyed by mt5_login, resolved in SQL', () => {
  // `accounts` is keyed the way trades are. Resolving it in the statement means the
  // caller never holds both ids, and an account with no login inserts nothing rather
  // than a row under NULL.
  const q = upsertBrokerBalanceQuery(32, { balance: 999.87, currency: 'EUR' });
  assert.match(q.text, /SELECT a\.mt5_login/);
  assert.match(q.text, /a\.mt5_login IS NOT NULL/);
  assert.deepEqual(q.values, [32, 999.87, 'EUR']);
  // A sync that resolved a balance but no currency must not blank one an earlier sync
  // established.
  assert.match(q.text, /currency\s+= COALESCE\(EXCLUDED\.currency, accounts\.currency\)/);
  // The EA's floating equity is a different and better number; a balance must not
  // overwrite it.
  assert.doesNotMatch(q.text, /SET[\s\S]*equity\s*=/);
});

test('the broker may correct a SYNCED account only', () => {
  // A manual account's currency is the user's own statement about their own bucket. The
  // broker-wins argument does not apply to it, and nothing here may reach it.
  const q = setBrokerCurrencyQuery(32, 'EUR');
  assert.match(q.text, /kind = 'synced'/);
  assert.match(q.text, /currency IS DISTINCT FROM \$2::text/,
    'IS DISTINCT FROM so the NULL case updates, and an unchanged value writes nothing');
  // Postgres cannot infer a bare parameter's type in `$2 IS NOT NULL` and refuses the
  // whole statement — verified against the dev database, not merely read.
  assert.match(q.text, /\$2::text IS NOT NULL/);
});

test('the worker actually sends the facts, and the route actually stores them', () => {
  /* THE END-TO-END WIRING, because every link in it is silent when broken. Two modules
   * and one HTTP body with no type system between them — the same shape as the
   * snake_vs_camel discovery bug, where a producer and a consumer disagreed about field
   * names and every field resolved to undefined with no error anywhere. */
  const backfill = read('../worker/ctrader/backfill.js');
  assert.match(backfill, /traderAccountFacts\(trader, await fetchAssets\(/);
  assert.match(backfill, /return \{ posted, windows: windows\.length, account \};/);
  // The asset list must never fail the job: an account whose currency we could not
  // resolve still has trades worth journalling.
  assert.match(backfill, /export async function fetchAssets[\s\S]*?catch \(err\)[\s\S]*?return \[\];/);

  const index = read('../worker/ctrader/index.js');
  assert.match(index, /this\.api\.report\(job\.job_id, \{ ok: true, stats: \{ posted, windows \}, account \}\)/);

  const routes = read('../src/routes/sync.js');
  assert.match(routes, /recordBrokerAccount\(accountId, b\.account\)/,
    'accountId comes from the JOB, never from the body');
  // Best effort: this is metadata riding along with a sync that already imported trades.
  assert.match(routes, /try \{\s*await recordBrokerAccount/);
});
