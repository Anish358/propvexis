// Enumerating the account(s) a TradeLocker login exposes -- and Ruling A.
//
// UNLIKE cTrader, there is no account-picker step. A pending mt5_accounts row
// (Task 7's brief §7.0) is bound to exactly one login by the FIRST ingested
// trade, with no chance for the trader to choose among several. So when
// /auth/jwt/all-accounts answers with more than one account for this login,
// there is nothing safe to do but refuse the job loudly rather than silently
// picking one -- Ruling A, decided in the brief rather than guessed at
// implementation time.

import { tlRequest } from './http.js';

export const TOO_MANY_ACCOUNTS_ERROR =
  'This TradeLocker login has more than one account — Auto Sync supports one account per login today';

/**
 * GET /auth/jwt/all-accounts.
 *
 * `isLive` is not read off the response -- TradeLocker's all-accounts payload
 * carries no environment field at all, only which host answered. It is passed
 * through from the caller (which already knows, because it is the host that
 * just authenticated) and threaded into the return value so the caller has one
 * object to persist rather than two.
 */
export async function discoverAccount({ host, token, isLive, fetchImpl = fetch }) {
  const body = await tlRequest(host, 'auth/jwt/all-accounts', { token, fetchImpl });
  const accounts = Array.isArray(body?.accounts) ? body.accounts : [];

  if (accounts.length === 0) {
    throw new Error('tradelocker: this login has no TradeLocker accounts to sync');
  }
  if (accounts.length > 1) {
    // markError (credentials.js) records this on the credential, same as any
    // other MT5-shaped login failure -- it is conservative and correct for the
    // one demo account this connector has to prove against; a picker step is
    // only worth building if a real trader hits it (brief §7.1).
    throw new Error(TOO_MANY_ACCOUNTS_ERROR);
  }

  const [account] = accounts;
  const accountId = Number(account.id);
  const accNum = Number(account.accNum);
  if (!Number.isFinite(accountId) || !Number.isFinite(accNum)) {
    throw new Error('tradelocker: all-accounts returned an unusable account id or accNum');
  }
  return { accountId, accNum, live: isLive === true };
}
