/* What to print under an account's name: which platform it is on, and the login
 * the trader recognises.
 *
 * A PLAIN .js MODULE so node:test can import it — the repo's convention for pure
 * logic that a JSX file uses (see accountGating.js, platformCatalog.js). Left
 * inline in the page it could only ever be asserted as source text, and the bug
 * below is about VALUES, not about the shape of the code.
 *
 * IT USED TO BE `MT5 ${a.mt5_login}`, UNCONDITIONALLY, and both halves were wrong
 * for anything that is not MetaTrader. mt5_login holds the BANDED value — 4e12 +
 * the cTrader account id — because that column is unique across every tenant and
 * a raw cTrader account number can collide with a stranger's MT5 login. It is an
 * internal join key. So a cTrader account rendered in production as
 * "MT5 4000048583094": not its platform, and not a number the trader has ever
 * seen. cTrader shows them 48583094, which is platform_login.
 */
const PLATFORM_NAME = {
  mt5: 'MT5',
  mt4: 'MT4',
  ctrader: 'cTrader',
  tradelocker: 'TradeLocker',
};

export function accountIdentity(a = {}) {
  const name = PLATFORM_NAME[a.platform] || a.platform || 'Account';
  // platform_login is the trader-facing number wherever one exists; mt5_login is
  // only the same thing on MetaTrader, where nothing is banded.
  const login = a.platform_login ?? a.mt5_login;
  // Never render "undefined" at the user: a pending account has no login yet.
  return login == null ? name : `${name} ${login}`;
}
