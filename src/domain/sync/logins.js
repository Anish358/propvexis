// Which region of the BIGINT number line a stored login belongs to.
//
// THE BUG THIS PREVENTS. mt5_accounts.mt5_login is UNIQUE *globally, across every
// tenant* (migration 0005), and since 0028 trades.account_id is a foreign key to
// it. cTrader's ctidTraderAccountId is also a plain integer and can collide
// numerically with some OTHER user's MT5 login. The failure is cross-tenant and
// the victim cannot fix it: user A holds MT5 login 314943467, user B connects
// their own cTrader account numbered 314943467, and B is refused with "already
// registered to another account" because of a stranger's unrelated data.
//
// So each platform gets a disjoint region:
//
//   negative        manual accounts   (ALREADY the case -- migration 0015, mt5_login = -id)
//   1 .. 1e12       MetaTrader        (natural broker logins, 6-10 digits)
//   4e12 + id       cTrader
//
// THIS IS A MAGIC NUMBER AND IT IS WORTH SAYING SO. It assumes no broker ever
// issues an MT5 login above four trillion; they are 9-10 digits, so the margin is
// roughly 4000x. The principled alternative -- re-keying to UNIQUE(platform,
// login) -- needs a platform column on `trades`, a backfill, and an FK rewrite on
// the hottest table in the schema. The band was chosen because migration 0015
// already solved this identical problem this identical way, and that has held
// without incident since.
//
// The REAL login lives in mt5_accounts.platform_login and is what every surface
// displays. The banded value is internal and appears only as a join key.

export const CTRADER_LOGIN_BASE = 4_000_000_000_000;

/** The internal join key for a cTrader account. */
export const toBandedLogin = (ctidTraderAccountId) =>
  CTRADER_LOGIN_BASE + Number(ctidTraderAccountId);

/** The cTrader account id back out of a banded login. */
export const fromBandedLogin = (login) => Number(login) - CTRADER_LOGIN_BASE;

/** Which platform's space a stored login sits in. */
export function platformOfLogin(login) {
  const n = Number(login);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 'manual';
  if (n >= CTRADER_LOGIN_BASE) return 'ctrader';
  return 'metatrader';
}
