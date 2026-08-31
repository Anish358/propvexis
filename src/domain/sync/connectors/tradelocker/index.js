// The TradeLocker connector's PURE half: what the wizard collected turned into a
// credential we are willing to store, plus the two modules that make an
// ordersHistory response into journal rows.
//
// ---------------------------------------------------------- WHAT WE ARE HOLDING
// TradeLocker authenticates with the trader's EMAIL, PASSWORD AND BROKER SERVER --
// the same password they log in with, fully trade-capable. There is no investor
// password, no OAuth, no scope, and no read-only credential of any kind. Spec §3
// records this as a product decision taken with open eyes (option (a)): we store
// it, sealed the way MT5's is, behind a consent step that says plainly what it
// can do.
//
// THAT MAKES ONE RULE STRUCTURAL RATHER THAN ASPIRATIONAL: this module exposes no
// order-placing function, and test/tradelocker-connector.test.js pins it. We must
// be unable to trade with the credential, not merely unwilling.
//
// The network half -- auth, the hourly JWT refresh, /trade/config, discovery,
// backfill paging and the /state reconciliation -- is Task 7 and needs a real
// demo account. Everything that can be wrong in a way the UI would not reveal
// lives here instead, where node:test can pin it today. Same split as cTrader.

import { toTradeLockerLogin, fromTradeLockerLogin } from '../../logins.js';
import { buildResolver, num, int, str, ORDERS_HISTORY_FIELDS, assertFields } from './columns.js';
import { pairOrders } from './pairing.js';

/** Base URLs. Demo and live are DIFFERENT HOSTS — decided once at discovery. */
export const TRADELOCKER_HOSTS = Object.freeze({
  live: 'https://live.tradelocker.com/backend-api/',
  demo: 'https://demo.tradelocker.com/backend-api/',
});

// Deliberately loose: the only thing worth rejecting is input that cannot
// possibly be an address, because /auth/jwt/token answers a malformed one with a
// bare 401 that surfaces three hours later as a failed unattended job rather than
// as a form error the trader can act on.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const tradelockerConnector = {
  id: 'tradelocker',

  hosts: TRADELOCKER_HOSTS,
  toBandedLogin: toTradeLockerLogin,
  fromBandedLogin: fromTradeLockerLogin,

  // The parsing surface, re-exported so the worker has one import.
  buildResolver,
  assertFields,
  pairOrders,
  num,
  int,
  str,
  ORDERS_HISTORY_FIELDS,

  /**
   * Validate and normalize a credential input. Pure — no DB, no crypto, no IO.
   *
   * The server is trimmed and otherwise left ALONE, for the reason the MT5
   * connector documents: a "helpful" normalization of a value we cannot verify
   * buys an unattended login failure hours later instead of a form error now.
   *
   * THE PASSWORD IS NOT TRIMMED. A leading or trailing space is a legal password
   * character; trimming it silently changes the credential and the login fails
   * with nothing to explain it. Errors never echo it — they reach logs and Sentry.
   */
  validateCredential(input = {}) {
    const email = String(input.email ?? '').trim();
    if (!email) return { ok: false, error: 'TradeLocker email is required' };
    if (!LOOKS_LIKE_EMAIL.test(email)) {
      return { ok: false, error: 'That does not look like an email address' };
    }

    const server = String(input.server ?? '').trim();
    if (!server) return { ok: false, error: 'TradeLocker server is required' };

    const password = String(input.password ?? '');
    if (!password) return { ok: false, error: 'TradeLocker password is required' };

    return { ok: true, value: { email, server, password } };
  },
};
