import { query } from '../../platform/db.js';

/**
 * What the BROKER says about an account, written down.
 *
 * Two facts, both of which the app was getting wrong for cTrader:
 *
 *  · THE DEPOSIT CURRENCY. `ProtoOAGetAccountListByAccessTokenRes` -- the only call
 *    discovery can make -- does not carry it, so routes/ctrader.js provisions with a
 *    `'USD'` fallback and there was nothing anywhere to correct it. On prod that put
 *    USD on a EUR demo account.
 *
 *  · THE BALANCE. It was only ever learned from a CLOSING DEAL (the `account_balance`
 *    field dealToTrade emits), so an account that has never closed a trade had no row
 *    in `accounts` at all -- prod account 33, connected and synced, with the app
 *    holding no idea what it contains. That is also precisely the account the prop
 *    engine's start_balance reconciliation cannot check.
 *
 * SPLIT INTO BUILDERS AND WRAPPERS, the way queue.js is: there is no test database, so
 * a query is only assertable in CI if it is a pure function returning { text, values }.
 *
 * THE INPUT IS TREATED AS HOSTILE. These values arrive in a worker's HTTP body from a
 * box we do not trust (see the note on POST /api/sync/jobs/:id/result), so nothing here
 * is written until sanitizeBrokerFacts has made it a number and a currency code.
 */

/**
 * Coerce a reported {balance, currency} into something writable, or null.
 *
 * Returns null rather than an object of nulls so a caller cannot accidentally write
 * "the broker says nothing" over a value it already holds. Each field is independently
 * nullable: an asset list we could not fetch gives a balance with no currency, and that
 * is worth storing on its own.
 */
export function sanitizeBrokerFacts(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = Number(raw.balance);
  const balance = raw.balance == null || !Number.isFinite(n) ? null : n;
  // ISO 4217 is three letters; the cap is generous for a broker inventing something,
  // and the character class is what stops a currency column becoming a text sink.
  const code = String(raw.currency ?? '').trim().toUpperCase();
  const currency = /^[A-Z]{2,8}$/.test(code) ? code : null;
  return balance == null && currency == null ? null : { balance, currency };
}

/**
 * The live balance/currency row the dashboard and the prop engine read.
 *
 * KEYED BY mt5_login, NOT BY mt5_accounts.id, because `accounts` is keyed the way trades
 * are -- the SELECT resolves it so the caller never has to hold both ids, and an account
 * with no login yet inserts nothing rather than a row under NULL.
 *
 * COALESCE on update, so a sync that resolved a balance but no currency (the asset list
 * was unavailable) does not blank a currency an earlier sync established.
 *
 * `equity` is deliberately untouched: this is a BALANCE, and overwriting the EA's
 * floating equity with it would make a live account's drawdown less accurate, not more.
 */
export function upsertBrokerBalanceQuery(accountId, { balance = null, currency = null } = {}) {
  return {
    text: `INSERT INTO accounts (account_id, balance, currency, updated_at)
           SELECT a.mt5_login, $2, $3, now()
             FROM mt5_accounts a
            WHERE a.id = $1 AND a.mt5_login IS NOT NULL
           ON CONFLICT (account_id) DO UPDATE
              SET balance    = COALESCE(EXCLUDED.balance, accounts.balance),
                  currency   = COALESCE(EXCLUDED.currency, accounts.currency),
                  updated_at = now()
        RETURNING account_id, balance, equity, currency;`,
    values: [accountId, balance, currency],
  };
}

/**
 * Correct the account's own currency from the broker's answer.
 *
 * THE BROKER WINS, AND ONLY FOR A SYNCED ACCOUNT. A trader cannot change the deposit
 * currency of a cTrader account from inside PropVexis -- the broker is simply the
 * authority on it, and the value we hold got there from a fallback constant rather than
 * from anyone's decision. `kind = 'synced'` is what keeps that argument true: a MANUAL
 * account's currency is the user's own statement about their own bucket, and this must
 * never reach it.
 *
 * `IS DISTINCT FROM` rather than `<>` so the NULL case updates too, and so a sync that
 * changes nothing writes nothing -- this runs on every job.
 */
export function setBrokerCurrencyQuery(accountId, currency) {
  return {
    text: `UPDATE mt5_accounts
              SET currency = $2
            WHERE id = $1
              AND kind = 'synced'
              -- EXPLICITLY ::text. Postgres cannot infer a parameter's type from
              -- an untyped $2 IS NOT NULL and refuses the whole statement with
              -- "could not determine data type of parameter $2" -- which a test
              -- that only asserts this string would never have seen.
              AND $2::text IS NOT NULL
              AND currency IS DISTINCT FROM $2::text
        RETURNING id, currency;`,
    values: [accountId, currency],
  };
}

// ---------------------------------------------------------------------------
// Thin DB wrappers
// ---------------------------------------------------------------------------

const run = async (q) => (await query(q.text, q.values)).rows;

/**
 * Record both, returning what changed. Never throws on unusable input: this is metadata
 * riding along with a sync result, and failing a job that successfully imported trades
 * because the currency looked odd would be the wrong trade entirely.
 */
export async function recordBrokerAccount(accountId, raw) {
  const facts = sanitizeBrokerFacts(raw);
  if (!facts) return null;
  const [row] = await run(upsertBrokerBalanceQuery(accountId, facts));
  const [acct] = facts.currency ? await run(setBrokerCurrencyQuery(accountId, facts.currency)) : [];
  return { balance: row ?? null, currency: acct?.currency ?? null };
}
