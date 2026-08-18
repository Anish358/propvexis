"""The terminal itself: one warm MT5 instance, re-pointed at each account.

Two facts shape this module:

  1. mt5.login() switches the account on an ALREADY-RUNNING terminal, so the
     ~10-20s cost of launching terminal.exe is paid once per firm, not once per
     job. That is the difference between "open, sync, close" and a queue that
     keeps up.
  2. The Python package holds one terminal connection per process and MT5 caps 32
     terminals per session — neither constrains a serial worker, which is why the
     queue is serial.

Prop white-label servers are frequently absent from the MetaQuotes server list, so
each firm gets its own portable install and `firm_key` selects it.
"""

import json
import logging
import os
import subprocess
import time
from pathlib import Path

import MetaTrader5 as mt5   # Windows-only; imported nowhere else in the agent

log = logging.getLogger('propvexis.mt5')

# Broker offsets are whole or half hours; rounding to 15 minutes absorbs the
# second or two of latency between reading the tick and reading our own clock
# without ever inventing a plausible-but-wrong offset.
OFFSET_GRANULARITY = 900

CALIBRATION_SYMBOLS = ('EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD')

# Terminal startup. The MT5 default of 60s does not cover a cold first launch, but
# three long attempts is nine minutes of a worker slot spent on a terminal that is
# usually never going to answer — the common cause is not slowness (see IPC_HINT).
INIT_TIMEOUT_MS = 90_000
INIT_ATTEMPTS = 2
INIT_RETRY_SECS = 15
# How long to let the terminal settle after launching it before probing the pipe.
LAUNCH_SETTLE_SECS = 20

# What -10005 actually means, in practice, on a server-side terminal.
#
# Diagnosed the hard way: the terminal starts, loads its main window, opens its
# listener — and puts up a modal `Login` dialog (window class #32770). Nothing
# completes the handshake behind a modal dialog, so initialize() times out or hangs.
#
# It reaches that state when it cannot log in unattended, and the usual reason is
# that the account's SERVER IS NOT IN THIS TERMINAL'S servers.dat. Confirmed for
# GoatFunded-Server against the generic MetaQuotes build: a byte search of
# servers.dat finds "MetaQuotes" and no "Goat". Prop white-label servers ship in the
# FIRM'S OWN installer, so each firm needs its own portable build.
# MT5's documented startup configuration. THIS IS THE ONE THAT MATTERS:
# AllowLiveTrading is the GUI's "Allow algorithmic trading" master switch, and it is
# OFF on a fresh install. With it off the terminal serves its pipe, accepts the
# connection, and refuses to speak the API -- see IPC_HINT.
#
# The Python-specific option ("Disable algorithmic trading via external Python API")
# must ALSO be off, but it is off by default; the master switch is the one that bites.
#
# Passing this at every launch rather than trusting settings.ini is what makes a
# rebuilt box behave like this one: a GUI setting nobody wrote down is not
# reproducible infrastructure.
#
# AllowDllImport is deliberately NOT set -- reading trade history needs no DLLs, and
# it is the one flag here with real blast radius.
START_CONFIG = """[Experts]
Enabled=1
AllowLiveTrading=1
"""

IPC_HINT = (
    'the terminal accepted the connection but refused the API. Check Tools > Options '
    '> Experts: "Allow algorithmic trading" must be ON (it is off by default) and '
    '"Disable algorithmic trading via external Python API" must be OFF. If the login '
    'itself failed, the server may be missing from this build\'s server list -- see '
    'agent/README.md'
)


class Mt5Error(RuntimeError):
    pass


class Terminal:
    """A warm terminal for one firm's portable install."""

    def __init__(self, exe_path, offset_cache_file):
        self.exe_path = exe_path
        self.offset_cache_file = Path(offset_cache_file)
        self._open = False

    def open(self):
        """Start the terminal with no account. Diagnostics only — prefer login()."""
        self._start(INIT_TIMEOUT_MS)

    def _start(self, timeout_ms):
        if self._open:
            return
        # HAND THE CREDENTIALS TO initialize(); DO NOT initialize-then-login.
        #
        # A terminal with no saved account opens its "open an account" wizard on
        # first run, and in that state the IPC handshake never completes — so
        # initialize() does not merely time out, it BLOCKS PAST ITS OWN TIMEOUT.
        # That looks like a hung agent rather than a misconfigured terminal.
        # Observed on this box: six minutes against a 180s timeout, no error.
        #
        # Passing login/password/server makes the terminal log in as it starts, so
        # there is no wizard to block on.
        last = None
        for attempt in range(1, INIT_ATTEMPTS + 1):
            self._launch_with_config()
            if mt5.initialize(path=self.exe_path, portable=True, timeout=timeout_ms):
                self._open = True
                log.info('terminal up: %s (attempt %d)', self.exe_path, attempt)
                return
            last = mt5.last_error()
            log.warning('initialize attempt %d/%d failed: %s', attempt, INIT_ATTEMPTS, last)
            # Leave no half-open IPC channel behind — the next attempt should start
            # from a known state rather than inherit this one.
            try:
                mt5.shutdown()
            except Exception:  # noqa: BLE001 - shutting down a dead channel is noise
                pass
            if attempt < INIT_ATTEMPTS:
                time.sleep(INIT_RETRY_SECS)
        # Name the likely cause in the error itself. This string lands in
        # sync_jobs.error and is shown to the user, so "IPC timeout" alone would
        # tell them nothing they can act on.
        raise Mt5Error(f'initialize failed after {INIT_ATTEMPTS} attempts: {last} -- {IPC_HINT}')

    def _launch_with_config(self):
        """Start the terminal ourselves, with the startup config applied.

        mt5.initialize() can launch the terminal, but not with a /config file — and
        the config is the only way to guarantee algorithmic trading is enabled
        without a human in the GUI. So launch it here and let initialize() ATTACH to
        what is already running.

        Harmless when a terminal is already up: MT5 refuses a second instance on the
        same data directory, and initialize() then attaches to the first.
        """
        cfg = Path(self.exe_path).parent / 'propvexis-start.ini'
        try:
            if cfg.read_text() != START_CONFIG:
                cfg.write_text(START_CONFIG)
        except OSError:
            cfg.write_text(START_CONFIG)
        try:
            subprocess.Popen([self.exe_path, '/portable', f'/config:{cfg}'],
                             close_fds=True)
            # The terminal needs a moment before its pipe is answerable; initialize()
            # does its own waiting after this.
            time.sleep(LAUNCH_SETTLE_SECS)
        except OSError as err:
            log.warning('could not launch the terminal directly: %s', err)

    def close(self):
        if self._open:
            mt5.shutdown()
            self._open = False

    def login(self, login, password, server, timeout_ms=60000):
        """Point the terminal at this account.

        Attach to the terminal (launching it if needed -- see _start), then switch
        accounts with mt5.login(). Credentials never go to initialize(): that path
        disconnects an already-authorized terminal and hangs.
        """
        self._start(INIT_TIMEOUT_MS)

        # ALREADY ON THIS ACCOUNT? DO NOT RE-LOGIN.
        #
        # The terminal restores its last account on startup, so after a launch it is
        # usually already where we want to be. Calling mt5.login() for the SAME
        # account then disconnects the live session and hangs -- measured here as
        # 'login failed ... (-10005, IPC timeout)' after 65s, with the terminal log
        # showing a disconnect and no reconnect.
        #
        # Only the login NUMBER is compared, never the server string: the terminal
        # reports 'FundedNext-Server 3' where the credential says
        # 'FundedNext-Server3', and the login is the identity that trades are filed
        # under anyway.
        #
        # CAVEAT, deliberately recorded rather than hidden: on this path the
        # read-only verdict comes from the terminal's LIVE session rather than from a
        # login with our stored password, so it proves the session is investor-mode
        # but not that our stored credential is the investor one. See
        # agent/README.md ("Verification caveat").
        info = mt5.account_info()
        if info is not None and int(info.login) == int(login):
            log.info('terminal already on account %s (no re-login)', login)
            return

        if not mt5.login(int(login), password=password, server=server, timeout=timeout_ms):
            raise Mt5Error(f'login failed for {login}@{server}: {mt5.last_error()}')

    def account(self):
        info = mt5.account_info()
        if info is None:
            raise Mt5Error(f'account_info unavailable: {mt5.last_error()}')
        return info

    def trade_allowed(self):
        """True when the credential can TRADE — i.e. it is a master password.

        This is the enforcement point for the investor-password-only rule. The
        backend deletes any credential that reports True here, so the promise
        "we only ever read" is a check rather than a claim.
        """
        return bool(self.account().trade_allowed)

    # --- server clock -------------------------------------------------------
    def server_offset_secs(self, server, symbols=CALIBRATION_SYMBOLS):
        """Seconds to subtract from MT5 timestamps to get true UTC.

        MT5 reports times in the broker's timezone dressed as a Unix timestamp,
        the same trap the EA solves with TimeTradeServer() - TimeGMT(). Python has
        no TimeTradeServer, so the offset is derived from a LIVE tick: its `time`
        is server-now, and our clock is UTC-now.

        A stale tick (weekend, dead symbol) tells us nothing, so the value is
        cached per server and reused. When neither a fresh tick nor a cached value
        exists we return None, and the caller refuses to post rather than guess —
        a wrong offset would silently mislabel every trade's session and push
        trades into the wrong day for drawdown maths.
        """
        cache = self._read_cache()
        fresh = self._offset_from_tick(symbols)
        if fresh is not None:
            if cache.get(server) != fresh:
                cache[server] = fresh
                self._write_cache(cache)
                log.info('calibrated %s at UTC%+d', server, fresh // 3600)
            return fresh
        cached = cache.get(server)
        if cached is None:
            log.warning('no clock calibration for %s and no live tick to derive one', server)
        return cached

    def _offset_from_tick(self, symbols):
        now = time.time()
        for sym in symbols:
            if not mt5.symbol_select(sym, True):
                continue
            tick = mt5.symbol_info_tick(sym)
            if tick is None or not tick.time:
                continue
            # Older than two minutes means the market is shut and the tick's
            # server time says nothing about server NOW.
            skew = tick.time - now
            if abs(skew) > 14 * 3600:
                continue
            rounded = round(skew / OFFSET_GRANULARITY) * OFFSET_GRANULARITY
            if abs(tick.time - now - rounded) < 120:
                return int(rounded)
        return None

    def _read_cache(self):
        try:
            return json.loads(self.offset_cache_file.read_text())
        except (OSError, ValueError):
            return {}

    def _write_cache(self, data):
        self.offset_cache_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.offset_cache_file.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, indent=2))
        os.replace(tmp, self.offset_cache_file)

    # --- history ------------------------------------------------------------
    def deals(self, since_epoch, until_epoch):
        got = mt5.history_deals_get(int(since_epoch), int(until_epoch))
        if got is None:
            err = mt5.last_error()
            # (1, 'Success') with None means "no deals", not a failure.
            if err and err[0] not in (1, 0):
                raise Mt5Error(f'history_deals_get failed: {err}')
            return []
        return list(got)

    def orders_for_position(self, position_id):
        got = mt5.history_orders_get(position=int(position_id))
        return list(got) if got else []

    def digits(self, symbol):
        info = mt5.symbol_info(symbol)
        return int(info.digits) if info else 5

    def m1_range(self, symbol, from_epoch, to_epoch):
        mt5.symbol_select(symbol, True)
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, int(from_epoch), int(to_epoch))
        return [] if rates is None else list(rates)
