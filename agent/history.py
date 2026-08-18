"""Turn MT5 deal history into the JSON the PropVexis ingest endpoints expect.

This is a port of ScanHistoryBackfill()/ProcessHistoricalClose()/BuildJson() from
ea/PropVexis.mq5. The EA and this module are two producers of ONE contract, so the
field names and the money math must match exactly — test/sync-agent-parity.test.js
pins that, because drift here would show up as subtly wrong analytics rather than
as an error.

Deliberately imports nothing from MetaTrader5. The MT5 package is Windows-only,
and keeping the grouping logic free of it is what lets these functions be tested
on any machine (see test_history.py).
"""

from datetime import datetime, timezone

# MT5 enum values, inlined so this module stays importable without the package.
DEAL_TYPE_BUY = 0
DEAL_TYPE_SELL = 1
DEAL_TYPE_BALANCE = 2

DEAL_ENTRY_IN = 0
DEAL_ENTRY_OUT = 1
DEAL_ENTRY_INOUT = 2
DEAL_ENTRY_OUT_BY = 3

CLOSING_ENTRIES = (DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY)


def iso_utc(server_epoch, offset_secs):
    """Server-time epoch -> ISO-8601 UTC, mirroring the EA's ToIso().

    MT5 reports times in the BROKER's timezone dressed up as a Unix timestamp, so
    the offset has to be subtracted or every trade lands hours away from when it
    happened — which would silently mislabel the ASIA/LDN/NY session and bucket
    trades into the wrong day for daily-drawdown maths.
    """
    if offset_secs is None:
        raise ValueError('server clock offset unknown — refusing to guess a timestamp')
    dt = datetime.fromtimestamp(int(server_epoch) - int(offset_secs), tz=timezone.utc)
    return dt.strftime('%Y-%m-%dT%H:%M:%SZ')


def group_positions(deals):
    """Group closed-position deals by position_id.

    Balance operations are excluded here and handled by payouts_from_deals; open
    positions (no closing deal) are skipped, because the journal records closed
    trades only.
    """
    by_position = {}
    for d in deals:
        if _int(d, 'type') == DEAL_TYPE_BALANCE:
            continue
        pos = _int(d, 'position_id')
        if not pos:
            continue
        by_position.setdefault(pos, []).append(d)
    return {
        pos: ds for pos, ds in by_position.items()
        if any(_int(x, 'entry') in CLOSING_ENTRIES for x in ds)
    }


def build_trade(position_id, deals, orders=(), digits=5):
    """One closed position -> the ingest payload, minus mfe_price.

    Mirrors ProcessHistoricalClose():
      - commission and swap accumulate over EVERY deal (a broker may put them on
        either leg);
      - the IN deal supplies entry price/time/volume/symbol/direction;
      - OUT and OUT_BY supply the exit price/time and accumulate profit;
      - SL/TP come from the position's history ORDERS, first non-zero wins,
        because deals do not carry them.

    Returns None when the position is not a usable closed trade.
    """
    entry_price = exit_price = volume = 0.0
    profit = commission = swap = 0.0
    open_time = close_time = None
    symbol = ''
    direction = 'buy'

    for d in sorted(deals, key=lambda x: (_int(x, 'time'), _int(x, 'ticket'))):
        commission += _float(d, 'commission')
        swap += _float(d, 'swap')
        entry = _int(d, 'entry')
        if entry == DEAL_ENTRY_IN:
            entry_price = _float(d, 'price')
            open_time = _int(d, 'time')
            volume = _float(d, 'volume')
            symbol = _str(d, 'symbol') or symbol
            direction = 'buy' if _int(d, 'type') == DEAL_TYPE_BUY else 'sell'
        elif entry in CLOSING_ENTRIES:
            exit_price = _float(d, 'price')
            close_time = _int(d, 'time')
            profit += _float(d, 'profit')
            if not symbol:
                symbol = _str(d, 'symbol')

    # The EA's guard, kept verbatim: without both legs the trade is not closed and
    # any R we derived from it would be fiction.
    if not symbol or not entry_price or not exit_price or open_time is None or close_time is None:
        return None

    sl = tp = 0.0
    for o in orders:
        osl = _float(o, 'sl')
        otp = _float(o, 'tp')
        if osl > 0 and sl == 0:
            sl = osl
        if otp > 0 and tp == 0:
            tp = otp

    return {
        'mt5_ticket': int(position_id),
        'symbol': symbol,
        'direction': direction,
        '_open_epoch': open_time,        # server time; converted by to_payload
        '_close_epoch': close_time,
        'entry_price': round(entry_price, digits),
        'sl_price': round(sl, digits) if sl > 0 else None,
        'tp_price': round(tp, digits) if tp > 0 else None,
        'exit_price': round(exit_price, digits),
        'volume': round(volume, 2),
        # The EA sends commission+swap as `commission` and profit+swap+commission
        # as `pnl_money`. Both conventions are load-bearing downstream, so they are
        # reproduced rather than "improved".
        'commission': round(commission + swap, 2),
        'pnl_money': round(profit + swap + commission, 2),
    }


def mfe_price(direction, entry, rates):
    """Peak favorable excursion over the trade's life, as a raw price distance.

    Mirrors ComputeMfeFullLife(): buy -> max(high) - entry, sell -> entry -
    min(low), floored at 0. The backend converts this to pips, so it must stay a
    price distance. Returns None when there are no bars, which the caller treats
    as "omit mfe_price" — exactly what the EA does with its -1 sentinel.
    """
    if not rates:
        return None
    is_buy = direction == 'buy'
    best = float(entry)
    for r in rates:
        high = _float(r, 'high')
        low = _float(r, 'low')
        if is_buy:
            best = max(best, high)
        else:
            best = min(best, low)
    return max(0.0, best - entry if is_buy else entry - best)


def to_payload(trade, login, offset_secs, account=None, digits=5, mfe=None):
    """Finish a trade dict into the exact body /api/trades/ingest accepts."""
    body = {k: v for k, v in trade.items() if not k.startswith('_')}
    body['account_id'] = int(login)
    body['open_time'] = iso_utc(trade['_open_epoch'], offset_secs)
    body['close_time'] = iso_utc(trade['_close_epoch'], offset_secs)
    if account:
        body['account_balance'] = round(float(account.get('balance', 0.0)), 2)
        body['account_equity'] = round(float(account.get('equity', 0.0)), 2)
        body['account_currency'] = account.get('currency') or None
    if mfe is not None:
        body['mfe_price'] = round(float(mfe), digits)
    return body


def payouts_from_deals(deals, login, offset_secs):
    """Prop payouts: balance operations with a NEGATIVE amount are withdrawals.

    Deposits and positive balance operations are ignored, matching
    ProcessPayoutDeal() — a deposit is not a payout, and treating it as one would
    inflate the trader's payout history.
    """
    out = []
    for d in deals:
        if _int(d, 'type') != DEAL_TYPE_BALANCE:
            continue
        amount = _float(d, 'profit')
        if amount >= 0:
            continue
        out.append({
            'account_id': int(login),
            'deal_ticket': str(_int(d, 'ticket')),
            'amount': round(abs(amount), 2),
            'time': iso_utc(_int(d, 'time'), offset_secs),
            'comment': _str(d, 'comment') or None,
        })
    return out


# --- field access -----------------------------------------------------------
# THREE record shapes reach this module, and they do not agree on access:
#   - deals/orders from MT5 are NAMEDTUPLES        -> attribute access
#   - rates from copy_rates_range are a NUMPY STRUCTURED ARRAY, whose rows are
#     numpy.void                                   -> KEY access only
#   - tests pass DICTS                             -> key access
#
# The first version of this used getattr() only. numpy.void has no `.high`, so
# every high/low silently read as the 0.0 default: for a sell that made `best` 0
# and MFE came out as the entire entry price -- 11577.1 pips on a real trade,
# recorded as fact. No error, and the unit tests could not catch it because they
# pass dicts. Try key access first, fall back to attributes.
def _get(rec, name, default=None):
    if isinstance(rec, dict):
        return rec.get(name, default)
    try:
        return rec[name]
    except (TypeError, IndexError, KeyError, ValueError):
        # A namedtuple raises TypeError on a string index; fall through to getattr.
        return getattr(rec, name, default)


def _int(rec, name):
    v = _get(rec, name, 0)
    return int(v or 0)


def _float(rec, name):
    v = _get(rec, name, 0.0)
    return float(v or 0.0)


def _str(rec, name):
    v = _get(rec, name, '')
    return str(v or '')
