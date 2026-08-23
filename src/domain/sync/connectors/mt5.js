// The MetaTrader 5 connector: the only one in Phase A.
//
// It owns exactly one thing today — turning what the wizard collected into a
// credential we are willing to store. Logging in, reading deals and posting
// trades all live in the Python agent (agent/), which talks to the same ingest
// endpoints the EA does; nothing about that changes here.

export const mt5Connector = {
  id: 'mt5',

  /**
   * Validate and normalize a credential input. Pure — no DB, no crypto, no IO.
   *
   * The login must be a positive integer for two reasons: negative logins are the
   * synthetic space manual accounts occupy (mt5_login = -id, migration 0015), and
   * a fractional or non-numeric login can never match a real MT5 account, so
   * accepting one buys an unattended login failure that surfaces ten minutes
   * later as an expired lease rather than as a form error.
   *
   * The server is trimmed and otherwise left ALONE. The terminal's own log prints
   * "FundedNext-Server 3" with a space and that string does not work — the real
   * name has none. Any cleverer normalization here would be a guess at a value we
   * cannot verify until an unattended login is already failing.
   */
  validateCredential(input = {}) {
    const server = String(input.server ?? '').trim();
    if (!server) return { ok: false, error: 'MT5 server is required' };

    const login = Number(input.login);
    if (!Number.isInteger(login) || login <= 0) {
      return { ok: false, error: 'MT5 login must be a positive account number' };
    }

    const password = String(input.password ?? '');
    if (!password) return { ok: false, error: 'Investor password is required' };

    return { ok: true, value: { server, login, password } };
  },
};
