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


class Mt5Error(RuntimeError):
    pass


class Terminal:
    """A warm terminal for one firm's portable install."""

    def __init__(self, exe_path, offset_cache_file):
        self.exe_path = exe_path
        self.offset_cache_file = Path(offset_cache_file)
        self._open = False

    def open(self):
        if self._open:
            return
        if not mt5.initialize(path=self.exe_path, portable=True):
            raise Mt5Error(f'initialize failed: {mt5.last_error()}')
        self._open = True
        log.info('terminal up: %s', self.exe_path)

    def close(self):
        if self._open:
            mt5.shutdown()
            self._open = False

    def login(self, login, password, server, timeout_ms=60000):
        self.open()
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
