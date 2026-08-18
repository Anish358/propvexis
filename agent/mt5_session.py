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
import time
from pathlib import Path

import MetaTrader5 as mt5   # Windows-only; imported nowhere else in the agent

log = logging.getLogger('propvexis.mt5')

# Broker offsets are whole or half hours; rounding to 15 minutes absorbs the
# second or two of latency between reading the tick and reading our own clock
# without ever inventing a plausible-but-wrong offset.
OFFSET_GRANULARITY = 900

CALIBRATION_SYMBOLS = ('EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD')

# Terminal startup. The MT5 default is 60s, which a fresh install does not meet.
INIT_TIMEOUT_MS = 180_000
INIT_ATTEMPTS = 3
INIT_RETRY_SECS = 20


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

    def _start(self, timeout_ms, creds=None):
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
            kwargs = {'path': self.exe_path, 'portable': True, 'timeout': timeout_ms}
            if creds:
                kwargs.update(login=int(creds[0]), password=creds[1], server=creds[2])
            if mt5.initialize(**kwargs):
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
        raise Mt5Error(f'initialize failed after {INIT_ATTEMPTS} attempts: {last}')

    def close(self):
        if self._open:
            mt5.shutdown()
            self._open = False

    def login(self, login, password, server, timeout_ms=60000):
        """Point the terminal at this account.

        A cold start hands the credentials to initialize() (see _start). A terminal
        that is already warm switches accounts with mt5.login(), which is the entire
        reason the terminal is kept running between jobs.
        """
        if not self._open:
            self._start(INIT_TIMEOUT_MS, creds=(login, password, server))
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
